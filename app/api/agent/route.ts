import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { runOrchestratorAgent } from '@/lib/agent/orchestrator';
import { assessRisk, isConfirmationMessage } from '@/lib/agent/riskGate';
import { getOrCreateUser, saveMessage, getUserRoleForProject, createTaskPlan, updateTaskPlan, getActiveTaskPlan, getProject, getMessages } from '@/lib/db';
import { generateWithFallback, isQuotaExhaustedError } from '@/lib/agent/geminiClient';

// Fast, cheap classification pass: is this message actually asking the agent
// to build/change/deploy something, or is it just a greeting / casual chat /
// unclear message? Without this, EVERY message (including "Hey" or "kya hua")
// was being treated as a full rebuild instruction — wasting API calls and
// confusing the user with an unwanted regeneration.

// Deterministic pre-check for obvious casual messages — zero API cost,
// and immune to classifyIntent's Gemini call failing/misbehaving. This
// exists because in production, classifyIntent's catch-all branch used
// to default to `isBuildRequest: true` on ANY non-quota error, which
// meant a single flaky classification call turned "Hey" into a full,
// expensive multi-feature site rebuild — repeatedly, burning quota that
// later legitimate requests then failed against.
const OBVIOUS_CASUAL_PATTERNS: RegExp[] = [
  /^(hey|hi|hello|yo|sup|hola)[\s!.,]*$/i,
  /^(kya\s*hua|kaise\s*ho|kese\s*ho|kaisa\s*hai|kya\s*haal|namaste|namaskar)[\s?!.,]*$/i,
  /^(thanks|thank\s*you|thx|ok|okay|good|nice|cool|great|wah|badiya|shukriya)[\s!.,]*$/i,
  /^(tum\s*kese\s*ho|tum\s*kaise\s*ho|how\s*are\s*you)[\s?!.,]*$/i,
];

function isObviouslyCasual(prompt: string): boolean {
  const trimmed = prompt.trim();
  // Only trust the deterministic list for short messages — a longer
  // message that happens to start with "hey" (e.g. "hey can you add a
  // pricing section") must still go through real classification.
  if (trimmed.split(/\s+/).length > 5) return false;
  return OBVIOUS_CASUAL_PATTERNS.some((p) => p.test(trimmed));
}

interface ProjectContext {
  projectName: string;
  hasExistingSite: boolean;
  recentHistory: string; // last few chat turns, formatted as plain text
}

async function classifyIntent(prompt: string, context: ProjectContext): Promise<{ isBuildRequest: boolean; conversationalReply?: string; rateLimited?: boolean }> {
  if (isObviouslyCasual(prompt)) {
    return {
      isBuildRequest: false,
      conversationalReply: "Hey! Bata do kya banana hai ya kya change karna hai website me.",
    };
  }

  try {
    const contents = `PROJECT CONTEXT:
- Project name: "${context.projectName}"
- Already has an existing built website: ${context.hasExistingSite ? 'YES' : 'NO (blank/new project)'}
${context.recentHistory ? `\nRECENT CONVERSATION (most recent last):\n${context.recentHistory}\n` : ''}
NEW USER MESSAGE: "${prompt}"`;

    const response = await generateWithFallback({
      contents,
      config: {
        systemInstruction:
          `You classify a chat message sent to a website-building AI agent, using the project context and recent conversation provided. Determine if it is a concrete instruction to build, add, change, fix, remove, deploy, or otherwise modify the website — versus a pure greeting, small talk, or a message with genuinely no actionable meaning even with context.

IMPORTANT: if the project already has an existing website (hasExistingSite: YES), treat ANY message that could plausibly refer to modifying, extending, or connecting something to THAT existing site as a build request — even if it uses vague/relative words like "is website" (this website), "isme", "connect karo", "yeh wala", "pichla jo bola tha". There is only one website in this project's context — never ask the user "which website do you mean", since the existing one IS the answer. Only classify as non-build if the message is truly a greeting/small-talk with no reference to changing anything.

If it is NOT a build instruction, write a short, warm, casual reply (in the same language/style the user used — Hindi/Hinglish/English) that responds naturally and asks what they'd like built or changed, WITHOUT regenerating or mentioning any website changes.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            is_build_request: { type: Type.BOOLEAN },
            conversational_reply: { type: Type.STRING },
          },
          required: ['is_build_request'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    return { isBuildRequest: Boolean(parsed.is_build_request), conversationalReply: parsed.conversational_reply };
  } catch (err) {
    if (isQuotaExhaustedError(err)) {
      // Don't cascade into the full generation pipeline — it will just hit
      // the same quota wall. Tell the user plainly and stop here.
      return {
        isBuildRequest: false,
        rateLimited: true,
        conversationalReply:
          "⏳ I'm currently rate-limited by the Gemini API (free-tier daily quota reached). Please wait a minute and try again, or upgrade your Gemini API plan for a higher limit: https://ai.google.dev/gemini-api/docs/rate-limits",
      };
    }
    // For any other classification failure, default to NOT treating it as
    // a build request. This is a deliberate flip from the old behavior
    // (default to build) — a false negative here just means the user
    // re-sends a clearer instruction; a false positive burns a full,
    // expensive multi-file generation on what might have been "Hey".
    console.warn('[agent-route] Intent classification failed, defaulting to conversational (not rebuilding):', err);
    return {
      isBuildRequest: false,
      conversationalReply: "Thoda issue aaya samajhne mein — clearly bata do kya banana/change karna hai, main turant kar dunga.",
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();

    const { projectId, prompt, autoDeploy } = body;

    if (!projectId || !prompt) {
      return NextResponse.json({ success: false, error: 'projectId and prompt are required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);

    // Team collaboration guard: viewers can look at a shared project but
    // cannot trigger generation (editors and the owner can).
    const role = await getUserRoleForProject(projectId, user.id);
    if (role === 'viewer') {
      return NextResponse.json({ success: false, error: 'You have view-only access to this project and cannot make changes.' }, { status: 403 });
    }
    if (!role) {
      return NextResponse.json({ success: false, error: 'You do not have access to this project.' }, { status: 403 });
    }

    // Save user's prompt message
    await saveMessage(projectId, user.id, 'user', prompt);

    // Classify intent BEFORE running the full generation pipeline — casual
    // chat gets a quick conversational reply instead of an unwanted rebuild.
    // Fetch project + recent history first so the classifier knows there's
    // already a website in this project and doesn't ask "which website"
    // for a message that plainly refers back to it.
    const projectForContext = await getProject(projectId, user.id);
    const recentMessages = await getMessages(projectId, user.id);
    const recentHistory = recentMessages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const intent = await classifyIntent(prompt, {
      projectName: projectForContext?.name || 'this project',
      hasExistingSite: Boolean(projectForContext?.files && Object.keys(projectForContext.files).length > 0),
      recentHistory,
    });
    if (!intent.isBuildRequest) {
      const reply = intent.conversationalReply || "Hey! Bata do kya banana hai ya kya change karna hai website me.";
      await saveMessage(projectId, user.id, 'assistant', reply);
      return NextResponse.json({
        success: true,
        result: { conversational: true, reply, tasksExecuted: 0 },
      });
    }

    // Execute Autonomous Agent Orchestrator
    //
    // Risk Gate: before spending a single Gemini call on generation, check
    // whether this prompt (or a stored one it's confirming) is destructive
    // enough to require an explicit human "yes, go ahead" first.

    const activePlan = await getActiveTaskPlan(projectId);
    const isResumingApproval = activePlan?.overall_status === 'pending_approval' && isConfirmationMessage(prompt);

    let promptToExecute = prompt;

    if (isResumingApproval && activePlan) {
      // User is confirming a previously-blocked destructive request —
      // execute the ORIGINAL prompt, not the confirmation text itself,
      // and close out the pending marker so it can't be resumed twice.
      promptToExecute = activePlan.original_prompt;
      await updateTaskPlan(activePlan.id, activePlan.tasks, 'completed');
      await saveMessage(projectId, user.id, 'assistant', '✅ Confirmed. Proceeding with the previously requested change now.');
    } else {
      const risk = assessRisk(prompt);
      if (risk.requiresApproval) {
        // HIGH risk (R >= 0.70): halt here. No generation, no GitHub/Vercel
        // calls happen until the user explicitly confirms in a follow-up
        // message. Store the original prompt so the confirmation can
        // resume it exactly, without the user having to retype it.
        const pendingPlan = await createTaskPlan(projectId, user.id, prompt, [
          { id: 'risk_review', description: `Awaiting human approval: ${risk.reason}` },
        ]);
        await updateTaskPlan(pendingPlan.id, pendingPlan.tasks, 'pending_approval');

        const reply = `⚠️ **This looks like a high-impact change** (risk score ${risk.riskScore.toFixed(2)}/1.00).\n\n${risk.reason}\n\nThis could affect production data or delete things that can't be easily recovered. Reply **"confirm"** (or "haan karo") if you want me to proceed exactly as requested, or rephrase your request if this wasn't your intent.`;
        await saveMessage(projectId, user.id, 'assistant', reply);

        return NextResponse.json({
          success: true,
          result: {
            requiresApproval: true,
            riskScore: risk.riskScore,
            reason: risk.reason,
            reply,
            tasksExecuted: 0,
          },
        });
      }
    }

    const result = await runOrchestratorAgent(projectId, user.id, promptToExecute, Boolean(autoDeploy));

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('Agent route execution error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Agent execution failed' }, { status: 500 });
  }
}
