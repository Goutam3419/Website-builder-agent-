import { Type } from '@google/genai';
import { getBrandProfile, getProject, getUserSettings, saveBrandProfile, saveMessage, updateProject } from '../db';
import { pushToGitHub, pushToGitHubViaPullRequest } from '../integrations/github';
import { deployToVercel, pollDeploymentStatus, fetchDeploymentLogs } from '../integrations/vercel';
import { diagnoseAndPatch } from './selfHeal';
import { syncToFirebase } from '../integrations/firebase';
import { getRelevantLessons, searchRelevantMemories, storeLessonMemory, storeMemoryChunk } from './rag';
import { validateProjectCode, ValidationReport } from './validator';
import { parseFilesField, FILES_FIELD_DESCRIPTION } from './parseFilesField';
import { generateWithFallback } from './geminiClient';

export interface StepProgress {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  detail?: string;
}

export interface AgentRunResult {
  messageId: string;
  plan: string[];
  reasoning: string;
  files: Record<string, string>;
  validationReport: ValidationReport;
  actionTaken: string;
  stepDetails: StepProgress[];
  liveUrl?: string;
  commitUrl?: string;
  firebaseSyncedPath?: string;
  responseText: string;
}

export async function runWebsiteAgent(
  projectId: string,
  userId: string,
  userPrompt: string,
  autoDeploy = false
): Promise<AgentRunResult> {
  const stepDetails: StepProgress[] = [
    { step: 'Initializing & Fetching Context', status: 'in_progress' },
    { step: 'Multi-Step Architectural Planning', status: 'pending' },
    { step: 'Code Generation & Refactoring', status: 'pending' },
    { step: 'Code Self-Validation & Correction', status: 'pending' },
    { step: 'Tool Execution (GitHub / Vercel / Firebase)', status: 'pending' },
  ];

  // 1. Fetch Project and User Settings
  const project = await getProject(projectId, userId);
  if (!project) {
    throw new Error(`Project ${projectId} not found for user ${userId}`);
  }

  const userSettings = await getUserSettings(userId);
  const existingFiles = project.files || {};

  // Part B: Save Triggers (User Correction & Style Preferences)
  const userCorrectionRegex = /\b(no|wrong|galat|incorrect|nahi|fix|bad|broken|failed|not what|stop|revert|error|bug|don't|should not|instead of)\b/i;
  if (userCorrectionRegex.test(userPrompt)) {
    await storeLessonMemory(
      projectId,
      userId,
      'user_correction',
      `User correction/feedback: "${userPrompt.substring(0, 100)}"`,
      `Strictly heed user correction in code generation: "${userPrompt}"`
    );
  }

  const stylePrefRegex = /\b(prefer|always use|dark theme|light theme|dark mode|light mode|tailwind|bootstrap|serif|sans-serif|font|color scheme|clean layout|minimal)\b/i;
  if (stylePrefRegex.test(userPrompt)) {
    await storeLessonMemory(
      projectId,
      userId,
      'style_preference',
      `User style preference: "${userPrompt.substring(0, 100)}"`,
      `Follow user styling choice: "${userPrompt}"`
    );
  }

  // Brand Detection Trigger
  const brandRegex = /\b(brand color|primary color|secondary color|accent color|font|logo|our brand is|theme should be|brand style|brand profile)\b/i;
  if (brandRegex.test(userPrompt)) {
    const hexMatches = userPrompt.match(/#[0-9a-fA-F]{3,8}\b/g);
    const fontMatch = userPrompt.match(/\b(font|typography)\s*(?:is|:|=)?\s*([A-Za-z0-9\s-]+)\b/i);
    const toneMatch = userPrompt.match(/\b(professional|playful|minimal|bold|luxury|modern|clean|dark|light)\b/i);

    await saveBrandProfile(projectId, {
      primary_color: hexMatches?.[0] || undefined,
      secondary_color: hexMatches?.[1] || undefined,
      font_family: fontMatch?.[2] ? fontMatch[2].trim() : undefined,
      tone: toneMatch?.[1] ? toneMatch[1].toLowerCase() : undefined,
      additional_notes: `Auto-detected from prompt: "${userPrompt.substring(0, 120)}"`,
    });
  }

  // 2. RAG Context, Brand Profile & Lessons Search
  const brandProfile = await getBrandProfile(projectId);
  let brandContext = '';
  if (brandProfile) {
    brandContext = `BRAND & DESIGN SYSTEM (must follow strictly across all generated/edited files):
- Primary Color: ${brandProfile.primary_color || 'Modern Indigo'}
- Secondary Color: ${brandProfile.secondary_color || 'Matching Neutral'}
- Accent Color: ${brandProfile.accent_color || 'Vibrant Accent'}
- Typography / Font: ${brandProfile.font_family || 'System Sans-Serif / Inter'}
- Brand Tone & Style: ${brandProfile.tone || 'Modern, Clean & Professional'}
${brandProfile.logo_description ? `- Logo Concept: ${brandProfile.logo_description}` : ''}
${brandProfile.additional_notes ? `- Brand Notes: ${brandProfile.additional_notes}` : ''}
Ensure ALL CSS, Tailwind utility classes (e.g., custom hex colors or inline style variables), headings, and visual elements strictly adhere to this Brand Profile.`;
  }

  const relevantMemories = await searchRelevantMemories(projectId, userId, userPrompt, 4);
  const ragContext = relevantMemories
    .map((m) => `[Historical Context - ${m.doc_type.toUpperCase()}]: ${m.title}\n${m.content}`)
    .join('\n\n');

  const relevantLessons = await getRelevantLessons(projectId, userId, userPrompt, 5);
  let lessonsContext = '';
  let repeatedFailureAlerts = '';

  if (relevantLessons.length > 0) {
    const formattedList = relevantLessons
      .map((l) => {
        const isRepeated = l.occurrence_count >= 3 || l.lesson_type === 'repeated_failure';
        if (isRepeated) {
          repeatedFailureAlerts += `\n⚠️ CRITICAL REPEATED FAILURE WARNING: The pattern "${l.trigger_summary}" has failed ${l.occurrence_count}x previously! Do NOT repeat the same code approach. Try an alternative implementation!`;
        }
        return `- [${l.lesson_type.toUpperCase()}, count: ${l.occurrence_count}x${isRepeated ? ' - REPEATED FAILURE' : ''}]: ${l.trigger_summary} -> Rule: ${l.fix_or_rule}`;
      })
      .join('\n');

    lessonsContext = `KNOWN MISTAKES TO AVOID & USER PREFERENCES (from past self-learning system):\n${formattedList}${repeatedFailureAlerts}`;
  }

  stepDetails[0].status = 'completed';
  stepDetails[1].status = 'in_progress';

  // 3. System Prompt & Reasoning Request to Gemini
  const systemInstruction = `You are an elite AI Website Builder Agent (Claude-level reasoning capability).
Your task is to plan, code, refactor, and build complete, production-ready web applications based on user instructions.

CRITICAL INSTRUCTIONS:
1. Always analyze the existing files and maintain consistent project architecture.
2. Provide a structured plan breaking down what pages, components, or files need creation or edits.
3. Generate complete, clean code without placeholder stubs or missing closing tags.
4. Output valid HTML/CSS/JS or React/TypeScript code.
5. If creating an HTML/JS web app, ensure an index.html file exists with modern Tailwind CSS styling via CDN or inline utilities.
6. Make visual designs modern, elegant, responsive, dark-mode-first or clean light mode depending on user intent.
7. NEVER repeat past mistakes or syntax errors recorded in the self-learning memory system.
8. WORKING CONTACT FORMS RULE: Whenever you generate or edit a contact, lead, or feedback form, ensure it submits via fetch to POST '/api/forms/submit' with body payload JSON:
   { "projectId": "${projectId}", "formName": "contact", "data": { "name": ..., "email": ..., "message": ... } }
   Include immediate visual user feedback (e.g. "Message sent successfully!"). NEVER use non-functional action="#" or empty alerts.
9. Return your response in JSON format conforming to the provided schema.`;

  const promptContent = `USER REQUEST:
${userPrompt}

EXISTING PROJECT NAME:
${project.name}

EXISTING FILES (${Object.keys(existingFiles).length}):
${JSON.stringify(Object.keys(existingFiles))}

${brandContext ? `${brandContext}\n\n` : ''}${lessonsContext ? `${lessonsContext}\n\n` : ''}${ragContext ? `RELEVANT HISTORICAL MEMORY:\n${ragContext}\n` : ''}

CURRENT FILE CONTENTS SUMMARY:
${Object.entries(existingFiles)
  .slice(0, 10)
  .map(([path, code]) => `--- File: ${path} ---\n${code.substring(0, 1500)}`)
  .join('\n\n')}

Plan and build/update the requested web application code.
Return a full updated/created set of project files inside the 'files' object.`;

  // Request JSON response from Gemini — automatically falls back through
  // the model chain if the primary model's quota is exhausted.
  const genResult = await generateWithFallback({
    contents: promptContent,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          plan: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of architectural planning steps executed',
          },
          reasoning: {
            type: Type.STRING,
            description: 'Transparent reasoning explaining design and code choices',
          },
          files: {
            type: Type.STRING,
            description: FILES_FIELD_DESCRIPTION,
          },
          suggestedAction: {
            type: Type.STRING,
            description: 'github_commit | vercel_deploy | firebase_sync | none',
          },
          assumptionMessage: {
            type: Type.STRING,
            description: 'Brief assumption made if instruction was ambiguous',
          },
        },
        required: ['plan', 'reasoning', 'files'],
      },
    },
  });
  if (genResult.fellBackFrom) {
    console.warn(`[engine] Fell back from [${genResult.fellBackFrom.join(', ')}] to ${genResult.modelUsed} due to quota.`);
  }

  stepDetails[1].status = 'completed';
  stepDetails[2].status = 'in_progress';

  let rawJsonText = genResult.text || '{}';
  let parsedOutput: any = {};
  try {
    parsedOutput = JSON.parse(rawJsonText);
  } catch (err) {
    console.warn('Failed to parse Gemini output as JSON, attempting cleanup:', err);
    parsedOutput = {
      plan: ['Generate requested updates'],
      reasoning: 'Updated project code based on prompt.',
      files: existingFiles,
    };
  }

  const planSteps: string[] = parsedOutput.plan || ['Analyze request', 'Update project files'];
  const agentReasoning: string = parsedOutput.reasoning || 'Updated website architecture and files.';
  let generatedFiles: Record<string, string> = {
    ...existingFiles,
    ...parseFilesField(parsedOutput.files),
  };

  // BUG THIS FIXES: the model would sometimes write a rich, detailed
  // "plan" and "reasoning" describing an elaborate site, but return an
  // EMPTY `files` value — traced to `files` being an unconstrained
  // OBJECT schema field (dynamic filepath keys can't be listed as fixed
  // `properties`), which Gemini's structured output frequently leaves
  // empty even while filling every other field correctly. Fixed at the
  // schema level above (files is now a JSON-stringified STRING field,
  // which structured output fills reliably) — this retry stays in place
  // as a defensive second layer in case a single generation still comes
  // back empty for an unrelated reason (e.g. the model genuinely
  // couldn't parse the request).
  const parsedFiles = parseFilesField(parsedOutput.files);
  const modelReturnedNoNewFiles = Object.keys(parsedFiles).length === 0;
  let usedFallbackStub = false;

  if (modelReturnedNoNewFiles) {
    console.warn('[engine] Gemini returned an empty files value on first attempt — retrying once with a stronger directive.');
    try {
      const retryResult = await generateWithFallback({
        contents: `${promptContent}\n\nIMPORTANT: Your previous attempt returned an EMPTY "files" value, which is a failure — a plan and reasoning with no actual file content is useless. You MUST populate "files" with at least one complete, real file (e.g. "index.html") containing the FULL working code for what you just described in your plan, encoded as a JSON string. Do not leave it empty again.`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              plan: { type: Type.ARRAY, items: { type: Type.STRING } },
              reasoning: { type: Type.STRING },
              files: { type: Type.STRING, description: `${FILES_FIELD_DESCRIPTION} MUST be non-empty.` },
              suggestedAction: { type: Type.STRING },
              assumptionMessage: { type: Type.STRING },
            },
            required: ['plan', 'reasoning', 'files'],
          },
        },
      });

      const retryParsed = JSON.parse(retryResult.text || '{}');
      const retryFiles = parseFilesField(retryParsed.files);
      if (Object.keys(retryFiles).length > 0) {
        generatedFiles = { ...existingFiles, ...retryFiles };
      } else {
        usedFallbackStub = true;
      }
    } catch (err) {
      console.warn('[engine] Retry generation attempt also failed:', err);
      usedFallbackStub = true;
    }
  }

  // Ensure default index.html only as a genuine last resort — and mark
  // that this happened, so the response text below can be honest about it.
  if (Object.keys(generatedFiles).length === 0 || !generatedFiles['index.html']) {
    usedFallbackStub = true;
    generatedFiles['index.html'] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col items-center justify-center p-6 font-sans">
  <div class="max-w-2xl w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center space-y-4">
    <h1 class="text-4xl font-bold tracking-tight text-white">${project.name}</h1>
    <p class="text-zinc-400 text-lg">${project.description || 'Welcome to your AI generated web application.'}</p>
    <div class="pt-4">
      <button onclick="alert('App Ready!')" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition">Explore Feature</button>
    </div>
  </div>
</body>
</html>`;
  }

  stepDetails[2].status = 'completed';
  stepDetails[3].status = 'in_progress';

  // 4. Code Self-Validation
  let validationReport = validateProjectCode(generatedFiles);

  // Store validation error lessons for memory
  for (const issue of validationReport.issues) {
    if (issue.type === 'error') {
      await storeLessonMemory(
        projectId,
        userId,
        'validation_error',
        `Validation error in ${issue.filePath}: ${issue.message}`,
        `Fix and avoid syntax/validation error (${issue.message}) in ${issue.filePath}`
      );
    }
  }

  // Self-Correction Loop if errors are present
  if (!validationReport.isValid) {
    console.log('Validation failed, triggering agent self-correction loop...');
    const errorDetails = validationReport.issues.map((i) => `File ${i.filePath}: ${i.message}`).join('\n');
    const correctionPrompt = `The previous code generation contained the following validation errors:
${errorDetails}

CURRENT FILE CONTENTS (fix these exact files):
${Object.entries(generatedFiles)
  .map(([path, code]) => `--- File: ${path} ---\n${code}`)
  .join('\n\n')}

Please fix these exact syntax/validation errors and return the corrected files, encoded as a JSON string.`;

    try {
      const correctionRes = await generateWithFallback({
        contents: correctionPrompt,
        config: {
          systemInstruction: 'Fix all reported code syntax errors in the provided file contents and return the complete corrected files.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              files: { type: Type.STRING, description: FILES_FIELD_DESCRIPTION },
              fixedSummary: { type: Type.STRING },
            },
            required: ['files'],
          },
        },
      });

      const fixedData = JSON.parse(correctionRes.text || '{}');
      const fixedFiles = parseFilesField(fixedData.files);
      if (Object.keys(fixedFiles).length > 0) {
        generatedFiles = { ...generatedFiles, ...fixedFiles };
        validationReport = validateProjectCode(generatedFiles); // Re-validate
      }
    } catch (err) {
      console.warn('Self-correction loop error:', err);
    }
  }

  stepDetails[3].status = 'completed';
  stepDetails[4].status = 'in_progress';

  // Save updated project files to database
  await updateProject(projectId, userId, { files: generatedFiles });

  // 5. Tool Integrations Execution (GitHub, Vercel, Firebase)
  let actionTaken = 'files_updated';
  let liveUrl: string | undefined = project.live_url;
  let commitUrl: string | undefined = undefined;
  let firebaseSyncedPath: string | undefined = undefined;

  // Auto-push to GitHub if token configured — skip entirely if generation
  // failed and we're only holding a placeholder stub. Pushing/deploying a
  // known-broken fallback page just to keep the "pipeline completed" look
  // is exactly the misleading behavior this fix removes.
  if (!usedFallbackStub && userSettings.github_token && userSettings.github_owner && userSettings.github_repo) {
    try {
      const ghResult = await pushToGitHub(
        userSettings.github_token,
        userSettings.github_owner,
        userSettings.github_repo,
        generatedFiles,
        `Update via Website Builder Agent: ${userPrompt.substring(0, 50)}`
      );
      if (ghResult.success) {
        commitUrl = ghResult.commitUrl;
        actionTaken += '_github';
      }
    } catch (err) {
      console.warn('GitHub push error during agent run:', err);
    }
  }

  // Deploy to Vercel if configured or requested — same guard as GitHub above.
  let selfHealNote = '';
  if (!usedFallbackStub && userSettings.vercel_token && (autoDeploy || parsedOutput.suggestedAction === 'vercel_deploy')) {
    try {
      let filesToDeploy = generatedFiles;
      let retryAttempt = 0;
      let deploySucceeded = false;
      let rollbackTriggered = false;

      // Self-heal loop: deploy -> poll -> if it failed fast, diagnose and
      // patch -> redeploy. Bounded by DIAGNOSTIC_MAX_RETRIES (default 3),
      // enforced inside diagnoseAndPatch itself.
      while (!deploySucceeded && !rollbackTriggered) {
        const vercelResult = await deployToVercel(
          userSettings.vercel_token,
          project.name,
          filesToDeploy,
          userSettings.vercel_team_id
        );

        if (!vercelResult.success || !vercelResult.deploymentId) {
          // Deployment couldn't even be created (bad token, network, etc.)
          // — nothing to diagnose from logs, so don't loop.
          selfHealNote = `\n\n⚠️ **Deployment failed to start:** ${vercelResult.error || 'unknown error'}`;
          break;
        }

        const status = await pollDeploymentStatus(userSettings.vercel_token, vercelResult.deploymentId, userSettings.vercel_team_id);

        if (status.readyState === 'READY') {
          liveUrl = status.url || vercelResult.url;
          await updateProject(projectId, userId, { live_url: liveUrl, files: filesToDeploy });
          generatedFiles = filesToDeploy;
          actionTaken += '_vercel';
          deploySucceeded = true;
          if (retryAttempt > 0) {
            selfHealNote = `\n\n🔧 **Self-Healed:** Build failed ${retryAttempt} time(s), the Diagnostic Agent patched it, and the retry succeeded.`;
          }
          break;
        }

        if (status.readyState === 'BUILDING') {
          // Still building past our poll window — not a failure, just slow.
          // Don't self-heal something that isn't actually broken.
          selfHealNote = `\n\n⏳ **Deployment still building** after the poll window — check the Vercel dashboard for final status.`;
          break;
        }

        // status.readyState is ERROR or CANCELED — attempt self-heal.
        const logs = await fetchDeploymentLogs(userSettings.vercel_token, vercelResult.deploymentId, userSettings.vercel_team_id);
        const diagnosis = await diagnoseAndPatch(logs, filesToDeploy, retryAttempt);

        if (diagnosis.rollbackTriggered || !diagnosis.patchRequired) {
          rollbackTriggered = true;
          selfHealNote = `\n\n🛑 **Self-Healing stopped, rolled back:** ${diagnosis.failureSummary} Live site was left unchanged at ${project.live_url || 'its previous URL'}.`;
          break;
        }

        filesToDeploy = { ...filesToDeploy, ...diagnosis.patchedFiles };
        retryAttempt += 1;
      }
    } catch (err) {
      console.warn('Vercel deploy error during agent run:', err);
      selfHealNote = `\n\n⚠️ **Deployment error:** ${err instanceof Error ? err.message : 'unknown error'}`;
    }
  }

  // Sync to Firebase if configured — same guard as GitHub/Vercel above.
  if (!usedFallbackStub && userSettings.firebase_db_url) {
    try {
      const fbResult = await syncToFirebase(userSettings.firebase_db_url, userSettings.firebase_secret, projectId, {
        name: project.name,
        files: generatedFiles,
        updated_at: new Date().toISOString(),
      });
      if (fbResult.success) {
        firebaseSyncedPath = fbResult.syncedPath;
        actionTaken += '_firebase';
      }
    } catch (err) {
      console.warn('Firebase sync error during agent run:', err);
    }
  }

  stepDetails[4].status = 'completed';

  // Build Final Response Summary
  const responseSummary = usedFallbackStub
    ? `### ⚠️ Generation Did Not Complete As Described

I described a plan (below) but the AI model failed to return the actual file content for it — twice (initial attempt + one retry) — so **what's actually live right now is a bare placeholder page, not the site described in the reasoning.**

**What I planned (but did not actually generate):**
${planSteps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

**Reasoning it gave (also not reflected in the real output):** ${agentReasoning}

**What to do:** Try sending the same request again — this is usually a transient generation issue, not a permanent one. If it keeps happening for the same prompt, try breaking it into a smaller, more specific request (e.g. "add a hero section" instead of a full multi-feature landing page in one shot).`
    : `### 🎯 Architectural Execution Summary
${planSteps.map((s, idx) => `${idx + 1}. **${s}**`).join('\n')}

**Reasoning:** ${agentReasoning}
${parsedOutput.assumptionMessage ? `\n> 💡 *Note:* ${parsedOutput.assumptionMessage}` : ''}

**Self-Validation Check:**
- Passed **${validationReport.passedChecksCount}** checks across **${validationReport.totalFilesChecked}** files.
- Status: ${validationReport.isValid ? '✅ All Syntax & Code Quality Checks Passed' : '⚠️ Minor Code Warnings'}

${commitUrl ? `- 🐙 **GitHub Commit Pushed:** [View Commit](${commitUrl})` : ''}
${liveUrl ? `- 🚀 **Live Vercel Deployment:** [View Website](${liveUrl})` : ''}
${firebaseSyncedPath ? `- 🔥 **Firebase Realtime DB Synced:** Ready` : ''}${selfHealNote}`;

  // Save Message in DB
  const savedMsg = await saveMessage(
    projectId,
    userId,
    'assistant',
    responseSummary,
    agentReasoning,
    actionTaken,
    stepDetails
  );

  // Store Memory Embedding for future RAG queries
  await storeMemoryChunk(
    projectId,
    userId,
    'decision',
    `User Request: ${userPrompt.substring(0, 50)}`,
    `Plan: ${planSteps.join(', ')}\nReasoning: ${agentReasoning}`
  );

  return {
    messageId: savedMsg.id,
    plan: planSteps,
    reasoning: agentReasoning,
    files: generatedFiles,
    validationReport,
    actionTaken,
    stepDetails,
    liveUrl,
    commitUrl,
    firebaseSyncedPath,
    responseText: responseSummary,
  };
}

// Visual Click-to-Edit Targeted Element Modifier
export async function runElementEditAgent(
  projectId: string,
  userId: string,
  elementInfo: {
    selector?: string;
    tagName?: string;
    outerHTML?: string;
    innerText?: string;
    filePath?: string;
  },
  userInstruction: string
): Promise<{
  project: any;
  validationReport: ValidationReport;
}> {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const existingFiles = project.files || {};
  let targetFilePath = elementInfo.filePath;
  if (!targetFilePath || !existingFiles[targetFilePath]) {
    const htmlFiles = Object.keys(existingFiles).filter((f) => f.endsWith('.html') || f.endsWith('.tsx') || f.endsWith('.jsx'));
    targetFilePath = htmlFiles[0] || Object.keys(existingFiles)[0] || 'index.html';
  }

  // Save User message in history
  const userMsgText = `[Element Edit] (${elementInfo.tagName || 'element'} ${elementInfo.selector || ''}): ${userInstruction}`;
  await saveMessage(
    projectId,
    userId,
    'user',
    userMsgText
  );

  const brandProfile = await getBrandProfile(projectId);
  let brandContext = '';
  if (brandProfile) {
    brandContext = `BRAND PROFILE: Primary Color: ${brandProfile.primary_color}, Font: ${brandProfile.font_family || 'default'}, Tone: ${brandProfile.tone || 'clean'}`;
  }

  const prompt = `TARGETED ELEMENT EDIT REQUEST:
The user clicked a specific element in the preview of '${targetFilePath}' and provided a targeted edit instruction.

TARGET ELEMENT DETAILS:
- Tag Name: ${elementInfo.tagName || 'unknown'}
- CSS Selector: ${elementInfo.selector || 'unknown'}
- Element Snippet / Content:
\`\`\`html
${(elementInfo.outerHTML || elementInfo.innerText || 'N/A').substring(0, 1000)}
\`\`\`

USER EDIT INSTRUCTION:
"${userInstruction}"

${brandContext ? `${brandContext}\n` : ''}

CURRENT FILE CONTENT (${targetFilePath}):
\`\`\`
${existingFiles[targetFilePath] || ''}
\`\`\`

INSTRUCTIONS FOR TARGETED EDIT:
1. Modify ONLY the specified element/section inside ${targetFilePath} according to the user instruction.
2. Keep the surrounding code, scripts, styles, layout, and remaining files completely intact.
3. Return updated content for ${targetFilePath} inside the 'files' object.`;

  const editResult = await generateWithFallback({
    contents: prompt,
    config: {
      systemInstruction: 'You are an expert targeted UI code editor. Modify ONLY the requested element inside the file while preserving all surrounding code.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reasoning: { type: Type.STRING },
          files: { type: Type.STRING, description: FILES_FIELD_DESCRIPTION },
        },
        required: ['reasoning', 'files'],
      },
    },
  });

  const text = editResult.text || '{}';
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.error('Failed to parse element edit response:', err);
  }

  const newFiles = { ...existingFiles, ...parseFilesField(parsed.files) };
  const validationReport = validateProjectCode(newFiles);

  await updateProject(projectId, userId, { files: newFiles });

  const assistantMsgText = `### 🎯 Targeted Element Edit Applied\n- **Target Element:** \`<${elementInfo.tagName || 'element'}>\` (${elementInfo.selector || ''})\n- **Instruction:** "${userInstruction}"\n\n**Reasoning:** ${parsed.reasoning || 'Modified target element code snippet while leaving rest of file intact.'}`;

  await saveMessage(
    projectId,
    userId,
    'assistant',
    assistantMsgText,
    parsed.reasoning || 'Targeted element edit complete.',
    `Targeted edit in ${targetFilePath}`
  );

  const updatedProj = await getProject(projectId, userId);

  return { project: updatedProj, validationReport };
}
