import { Type } from '@google/genai';
import {
  createTaskPlan,
  getBrandProfile,
  getProject,
  getUserSettings,
  saveMessage,
  updateProject,
  updateTaskPlan,
  recordPullRequest,
  TaskPlan,
  TaskPlanItem,
} from '../db';
import { pushToGitHub, pushToGitHubViaPullRequest } from '../integrations/github';
import { deployToVercel } from '../integrations/vercel';
import { getRelevantLessons, searchRelevantMemories, storeLessonMemory } from './rag';
import { validateProjectCode, ValidationReport } from './validator';
import { parseFilesField, FILES_FIELD_DESCRIPTION } from './parseFilesField';
import { runWebsiteAgent } from './engine';
import { generateWithFallback } from './geminiClient';

export interface OrchestratorRunResult {
  messageId: string;
  taskPlan: TaskPlan;
  finalFiles: Record<string, string>;
  summaryText: string;
  toolDecisionText?: string;
  suggestion?: {
    text: string;
    quickActionPrompt: string;
  };
}

// Heuristic to detect if a request warrants multi-step decomposition
export function isComplexRequest(userPrompt: string): boolean {
  const promptLower = userPrompt.toLowerCase();

  // Multi-page signals
  const pageMatches = promptLower.match(/\b(page|pages|home|about|services|contact|portfolio|blog|pricing|features|dashboard|team|faq)\b/g) || [];
  const uniquePages = new Set(pageMatches);
  if (uniquePages.size >= 2) return true;

  // Multi-step / complex keywords
  const complexKeywords = [
    'build a', 'create a', 'full website', 'complete website', 'multi-page', 'multi page',
    'landing page with', 'application with', 'system with', 'redesign', 'e-commerce',
    'portfolio with', 'business website', 'agency website', 'saas website', 'platform with'
  ];

  const hasComplexKeyword = complexKeywords.some((kw) => promptLower.includes(kw));
  if (hasComplexKeyword) return true;

  // Long detailed prompt
  if (userPrompt.length > 120 && userPrompt.includes('and')) return true;

  return false;
}

// Extract navbar, footer, and styling context for multi-page consistency (Part D)
function extractMultiPageConsistencyContext(files: Record<string, string>): string {
  const indexContent = files['index.html'] || files['Index.html'] || Object.values(files)[0] || '';
  if (!indexContent) return '';

  let navSnippet = '';
  const navMatch = indexContent.match(/<nav[\s\S]*?<\/nav>/i) || indexContent.match(/<header[\s\S]*?<\/header>/i);
  if (navMatch) {
    navSnippet = navMatch[0].substring(0, 1200);
  }

  let footerSnippet = '';
  const footerMatch = indexContent.match(/<footer[\s\S]*?<\/footer>/i);
  if (footerMatch) {
    footerSnippet = footerMatch[0].substring(0, 800);
  }

  let headIncludes = '';
  const headMatch = indexContent.match(/<head[\s\S]*?<\/head>/i);
  if (headMatch) {
    headIncludes = headMatch[0].substring(0, 800);
  }

  return `
MULTIPAGE VISUAL & STRUCTURAL CONSISTENCY CONTRACT:
All generated pages MUST maintain perfect visual consistency with the main index.html file:
1. HEAD / STYLES INCLUDES (Use exact same CSS/CDN scripts):
${headIncludes ? headIncludes : 'Use standard Tailwind CDN & FontAwesome links'}

2. NAVBAR STRUCTURE (Re-use exact same layout, header links, & logo styling across all pages):
${navSnippet ? navSnippet : 'Maintain standard responsive top navbar with brand logo & page links'}

3. FOOTER STRUCTURE (Re-use exact same footer layout across all pages):
${footerSnippet ? footerSnippet : 'Maintain standard footer layout'}

Ensure page-to-page navigation links (e.g., href="index.html", href="about.html", href="services.html", href="contact.html") are valid and active!
`;
}

// Detects Gemini's "quota exhausted" (HTTP 429 / RESOURCE_EXHAUSTED) errors.
// When this happens, retrying immediately or continuing to the next task
// just burns more quota on calls that will also fail — better to stop
// cleanly and tell the user plainly what happened.
function isQuotaExhaustedError(err: any): boolean {
  const msg = (err?.message || String(err) || '').toLowerCase();
  return msg.includes('resource_exhausted') || msg.includes('429') || msg.includes('quota');
}

export async function runOrchestratorAgent(
  projectId: string,
  userId: string,
  userPrompt: string,
  autoDeploy = false
): Promise<any> {
  // If request is simple, fall back to fast single-shot engine
  if (!isComplexRequest(userPrompt)) {
    console.log(`[Orchestrator] Simple request detected. Running single-shot engine.`);
    return runWebsiteAgent(projectId, userId, userPrompt, autoDeploy);
  }

  console.log(`[Orchestrator] Complex request detected. Triggering Task Decomposition Engine.`);

  const project = await getProject(projectId, userId);
  if (!project) throw new Error(`Project ${projectId} not found.`);

  const existingFiles = project.files || {};
  const brandProfile = await getBrandProfile(projectId);
  const userSettings = await getUserSettings(userId);

  // 1. STEP DECOMPOSITION CALL
  const decompositionPrompt = `
You are an autonomous Task Decomposition Engine for a website builder AI agent.
Break down this user request into 3 to 8 logical, sequential concrete tasks.
If the request requires building multiple pages (e.g. Home, About, Services, Contact), assign each page/major section its own distinct task.

USER PROMPT:
"${userPrompt}"

EXISTING FILES (${Object.keys(existingFiles).length}):
${JSON.stringify(Object.keys(existingFiles))}

Return a JSON object conforming strictly to this schema:
{
  "is_multi_page": true/false,
  "tasks": [
    { "id": "task_1", "description": "Short, concrete description of sub-task 1" },
    ...
  ]
}
`;

  const decompResponse = await generateWithFallback({
    contents: decompositionPrompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          is_multi_page: { type: Type.BOOLEAN },
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ['id', 'description'],
            },
          },
        },
        required: ['is_multi_page', 'tasks'],
      },
    },
  });

  let decompResult: { is_multi_page: boolean; tasks: { id: string; description: string }[] } = {
    is_multi_page: false,
    tasks: [],
  };

  try {
    decompResult = JSON.parse(decompResponse.text || '{}');
  } catch (e) {
    decompResult = {
      is_multi_page: false,
      tasks: [
        { id: 'task_1', description: 'Setup base architecture & core page' },
        { id: 'task_2', description: 'Implement interactive components and styling' },
      ],
    };
  }

  if (!decompResult.tasks || decompResult.tasks.length === 0) {
    decompResult.tasks = [
      { id: 'task_1', description: 'Design layout & main components' },
      { id: 'task_2', description: 'Finalize styling and responsiveness' },
    ];
  }

  // Save Task Plan in DB
  const taskPlan = await createTaskPlan(projectId, userId, userPrompt, decompResult.tasks);
  let currentFiles: Record<string, string> = { ...existingFiles };
  const taskItems: TaskPlanItem[] = [...taskPlan.tasks];

  // 2. SEQUENTIAL TASK EXECUTION
  for (let idx = 0; idx < taskItems.length; idx++) {
    const task = taskItems[idx];
    task.status = 'in_progress';
    await updateTaskPlan(taskPlan.id, taskItems, 'in_progress');

    let retries = 0;
    let taskSuccess = false;

    while (retries <= 2 && !taskSuccess) {
      try {
        const consistencyContext = decompResult.is_multi_page ? extractMultiPageConsistencyContext(currentFiles) : '';

        const taskExecutionPrompt = `
TASK EXECUTION (${idx + 1}/${taskItems.length}):
Sub-Task Goal: "${task.description}"
Original Project Goal: "${userPrompt}"

${consistencyContext}

BRAND SYSTEM:
- Primary Color: ${brandProfile?.primary_color || 'Indigo'}
- Font Family: ${brandProfile?.font_family || 'Sans-Serif'}
- Style Tone: ${brandProfile?.tone || 'Clean, Professional & Modern'}

CURRENT PROJECT FILES (${Object.keys(currentFiles).length}):
${JSON.stringify(Object.keys(currentFiles))}

Execute this sub-task precisely. Update existing files or add new files as needed.
WORKING CONTACT FORMS RULE: If generating a form, submit via fetch to POST '/api/forms/submit' with JSON { projectId: "${projectId}", formName: "contact", data: {...} }.
Return the full updated/created set of project files as a JSON-stringified object in the 'files' field.
`;

        const taskGenResponse = await generateWithFallback({
          contents: taskExecutionPrompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: 'Summary of changes made for this task' },
                files: { type: Type.STRING, description: FILES_FIELD_DESCRIPTION },
              },
              required: ['summary', 'files'],
            },
          },
        });

        const parsedTaskOut = JSON.parse(taskGenResponse.text || '{}');
        const taskFiles = parseFilesField(parsedTaskOut.files);
        const updatedFiles = { ...currentFiles, ...taskFiles };

        if (Object.keys(taskFiles).length === 0) {
          // Same class of bug as the empty-files fallback in engine.ts:
          // validating the UNCHANGED currentFiles would pass (they were
          // already valid) and silently mark a no-op task as successful.
          // Treat it as a failed attempt instead, so it actually retries.
          retries++;
          task.retry_count = retries;
          if (retries > 2) {
            console.warn(`[Orchestrator] Task ${task.id} returned no file content after 2 retries. Skipping task.`);
            task.status = 'skipped';
            task.result_summary = 'Skipped: model returned no file content across 3 attempts.';
            await storeLessonMemory(
              projectId,
              userId,
              'validation_error',
              `Skipped task ${task.id}: repeated empty file generation`,
              `Task description "${task.description}" repeatedly produced no file content — consider splitting into a smaller task.`
            );
          }
          continue;
        }

        // Validate Task Output. During a multi-page build, skip the
        // broken-internal-link check per-task: earlier pages (e.g. Home)
        // legitimately link to sibling pages (about.html, contact.html)
        // that later tasks haven't generated yet. That full cross-page
        // check runs once, after every task has completed, below.
        const valReport = validateProjectCode(updatedFiles, {
          skipBrokenLinkCheck: decompResult.is_multi_page,
        });
        if (valReport.isValid) {
          currentFiles = updatedFiles;
          task.status = 'completed';
          task.result_summary = parsedTaskOut.summary || 'Task executed successfully';
          taskSuccess = true;
        } else {
          retries++;
          task.retry_count = retries;
          if (retries > 2) {
            console.warn(`[Orchestrator] Task ${task.id} failed after 2 retries. Skipping task.`);
            task.status = 'skipped';
            task.result_summary = `Skipped after 2 retries: ${valReport.issues.map((i) => i.message).join('; ')}`;
            // Store lesson
            await storeLessonMemory(
              projectId,
              userId,
              'validation_error',
              `Skipped task ${task.id} due to validation issues: ${task.description}`,
              `Avoid errors when executing sub-task: ${valReport.issues[0]?.message}`
            );
          }
        }
      } catch (err: any) {
        if (isQuotaExhaustedError(err)) {
          // No point retrying or continuing to the next task — the same
          // quota error will just repeat. Mark this and every remaining
          // task as skipped with ONE clean message, save progress, and
          // stop the loop immediately.
          task.status = 'skipped';
          task.result_summary = '⏳ Gemini API rate limit reached — this task was not completed.';
          for (let laterIdx = idx + 1; laterIdx < taskItems.length; laterIdx++) {
            taskItems[laterIdx].status = 'skipped';
            taskItems[laterIdx].result_summary = '⏳ Skipped — Gemini API rate limit was reached earlier in this run.';
          }
          await updateTaskPlan(taskPlan.id, taskItems, 'completed');
          await updateProject(projectId, userId, { files: currentFiles });

          const rateLimitMsg =
            "⏳ **Gemini API rate limit reached.** Your API key's request quota ran out partway through this build " +
            '(free-tier Gemini keys are limited to a small number of requests per day, and a single complex build can use many calls). ' +
            `What was completed before the limit (${idx}/${taskItems.length} tasks) has been saved. Please wait a minute and try again, ` +
            'or upgrade your Gemini API plan for a higher quota: https://ai.google.dev/gemini-api/docs/rate-limits';

          const savedRateLimitMsg = await saveMessage(
            projectId,
            userId,
            'assistant',
            rateLimitMsg,
            'Rate Limit Handler',
            'Gemini API quota exhausted — stopped cleanly instead of retrying',
            taskItems
          );

          return {
            messageId: savedRateLimitMsg.id,
            taskPlan,
            finalFiles: currentFiles,
            summaryText: rateLimitMsg,
            toolDecisionText: '',
            suggestion: null,
            commitUrl: null,
            rateLimited: true,
          };
        }

        retries++;
        task.retry_count = retries;
        if (retries > 2) {
          task.status = 'skipped';
          task.result_summary = 'Skipped after repeated errors during generation.';
        }
      }
    }

    // Save progress after each task
    await updateTaskPlan(taskPlan.id, taskItems, 'in_progress');
    await updateProject(projectId, userId, { files: currentFiles });
  }

  // Mark Task Plan complete
  const hasFailures = taskItems.some((t) => t.status === 'skipped' || t.status === 'failed');
  const finalStatus = hasFailures ? 'completed' : 'completed';
  await updateTaskPlan(taskPlan.id, taskItems, finalStatus);

  // Final full cross-page validation (Part D follow-up): now that every
  // page task has run, re-check broken internal links across the WHOLE
  // finished site. Any real broken links are recorded as a lesson so the
  // agent avoids them next time, but don't retroactively fail tasks that
  // already completed.
  if (decompResult.is_multi_page) {
    const finalLinkCheck = validateProjectCode(currentFiles, { skipBrokenLinkCheck: false });
    const brokenLinkIssues = finalLinkCheck.issues.filter((i) => i.message.startsWith('Broken internal link'));
    if (brokenLinkIssues.length > 0) {
      await storeLessonMemory(
        projectId,
        userId,
        'validation_error',
        `Multi-page site finished with ${brokenLinkIssues.length} broken internal link(s)`,
        `When building multi-page sites, double-check that every href="page.html" reference matches an actually generated file: ${brokenLinkIssues.map((i) => i.message).join('; ')}`
      );
    }
  }

  // 3. AUTONOMOUS TOOL-USE DECISIONS (Part B)
  let toolDecisionText = '';
  let commitUrl: string | undefined = undefined;

  try {
    const decisionPrompt = `
Analyze the work completed across these tasks:
${taskItems.map((t) => `- [${t.status}] ${t.description}: ${t.result_summary}`).join('\n')}

Rate the overall impact/significance of these changes:
Options: "minor" | "moderate" | "major"
Provide a 1-sentence transparent reasoning explaining your choice.
`;

    const decisionRes = await generateWithFallback({
      contents: decisionPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            significance: { type: Type.STRING },
            reasoning: { type: Type.STRING },
          },
          required: ['significance', 'reasoning'],
        },
      },
    });

    const decision = JSON.parse(decisionRes.text || '{}');
    const significance = decision.significance || 'moderate';
    const reasoning = decision.reasoning || 'Updated core pages and components.';

    if (userSettings?.github_token && userSettings?.github_repo) {
      const repoParts = userSettings.github_repo.split('/');
      const owner = repoParts.length > 1 ? repoParts[0] : repoParts[0];
      const repoName = repoParts.length > 1 ? repoParts[1] : repoParts[0];

      if (significance === 'minor' || significance === 'moderate') {
        const commitMsg = `Autonomous update (${significance}): ${reasoning}`;
        const commitRes = await pushToGitHub(userSettings.github_token, owner, repoName, currentFiles, commitMsg);
        if (commitRes.success) {
          commitUrl = commitRes.commitUrl;
          toolDecisionText = `📦 **Autonomous Action**: Since these were ${significance} changes, I automatically pushed a commit to GitHub: "${reasoning}"`;
        }
      } else {
        // Major change: don't push straight to main — open a real Pull
        // Request instead, with an AI-written review summary, so a human
        // can review before merging.
        const reviewSummary = `## Automated Review Summary\n\n**Significance**: Major\n**Reasoning**: ${reasoning}\n\n### Tasks completed in this change:\n${taskItems.map((t) => `- [${t.status}] ${t.description}`).join('\n')}\n\n_This PR was opened automatically by the agent because the change was classified as significant enough to warrant human review before merging._`;

        const prResult = await pushToGitHubViaPullRequest(
          userSettings.github_token,
          owner,
          repoName,
          currentFiles,
          `Major update: ${reasoning}`,
          reviewSummary
        );

        if (prResult.success && prResult.prUrl) {
          await recordPullRequest(projectId, userId, {
            branchName: prResult.branchName || '',
            prUrl: prResult.prUrl,
            prNumber: prResult.prNumber || 0,
            title: `Major update: ${reasoning}`,
            reviewSummary,
          });
          toolDecisionText = `🔀 **Autonomous Action**: This was a **major change** (${reasoning}), so instead of committing directly, I opened a Pull Request for review: ${prResult.prUrl}`;
        } else {
          toolDecisionText = `💡 **Decision Note**: These changes represent a **major redesign/update** (${reasoning}). I tried to open a Pull Request automatically but it failed (${prResult.error || 'unknown error'}) — you can push manually from the Integrations tab.`;
        }
      }
    }
  } catch (err) {
    console.warn('Error during autonomous tool decision:', err);
  }

  // 4. SELF-INITIATED IMPROVEMENT SUGGESTIONS (Part E)
  let suggestion: { text: string; quickActionPrompt: string } | undefined = undefined;
  try {
    const analysisPrompt = `
Perform a quick self-analysis pass over these generated project files (${Object.keys(currentFiles).join(', ')}).
Look for any obvious missing piece, missing meta description, orphaned page link, missing mobile menu, or form submit handler.
If you find an obvious high-value improvement, return has_suggestion: true with a 1-sentence friendly suggestion and a quick-action prompt.

Files summary:
${Object.entries(currentFiles)
  .slice(0, 5)
  .map(([p, c]) => `[${p}]: ${c.substring(0, 500)}...`)
  .join('\n')}
`;

    const analysisRes = await generateWithFallback({
      contents: analysisPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            has_suggestion: { type: Type.BOOLEAN },
            suggestion_text: { type: Type.STRING },
            quickActionPrompt: { type: Type.STRING },
          },
          required: ['has_suggestion'],
        },
      },
    });

    const sugData = JSON.parse(analysisRes.text || '{}');
    if (sugData.has_suggestion && sugData.suggestion_text && sugData.quickActionPrompt) {
      suggestion = {
        text: sugData.suggestion_text,
        quickActionPrompt: sugData.quickActionPrompt,
      };
    }
  } catch (err) {
    console.warn('Error generating self-initiated suggestion:', err);
  }

  // 5. SAVE CHAT MESSAGE & RETURN
  const summaryBullets = taskItems
    .map((t) => `${t.status === 'completed' ? '✅' : t.status === 'skipped' ? '⚠️' : '⏳'} **${t.description}**: ${t.result_summary || t.status}`)
    .join('\n');

  let responseMarkdown = `### Autonomous Agent Plan Executed (${taskItems.length} Tasks)\n\n${summaryBullets}\n\n`;
  if (toolDecisionText) {
    responseMarkdown += `${toolDecisionText}\n\n`;
  }
  if (suggestion) {
    responseMarkdown += `💡 **Proactive Suggestion**: ${suggestion.text}\n*Quick Action Available*: "${suggestion.quickActionPrompt}"`;
  }

  const savedMsg = await saveMessage(
    projectId,
    userId,
    'assistant',
    responseMarkdown,
    'Autonomous Task Decomposition Engine',
    toolDecisionText || 'Task plan completed',
    taskItems
  );

  return {
    messageId: savedMsg.id,
    taskPlan,
    finalFiles: currentFiles,
    summaryText: responseMarkdown,
    toolDecisionText,
    suggestion,
    commitUrl,
  };
}
