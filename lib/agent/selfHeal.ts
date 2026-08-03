// Diagnostic & Self-Healing Agent
//
// Adapted from the PDF spec's per-file patch schema to this app's data
// model, where a "project" is a flat Record<filePath, content> map rather
// than discrete CREATE/UPDATE/DELETE git operations. So instead of one
// file_path + updated_content, this returns a partial files map to merge
// over the current one — same idea (targeted fix, not a full regen),
// different shape to match how the rest of the app already works.
//
// The retry boundary is enforced HERE, in code, not left to the model's
// self-reported retry_attempt_count — same principle applied in the
// orchestrator's risk gate: don't trust the model to police its own limits.

import { Type } from '@google/genai';
import { parseFilesField, FILES_FIELD_DESCRIPTION } from './parseFilesField';
import { generateWithFallback } from './geminiClient';

export interface DiagnosisResult {
  diagnosticStatus: 'BUILD_FAILURE' | 'RUNTIME_ERROR' | 'UNKNOWN';
  failureSummary: string;
  patchRequired: boolean;
  patchedFiles: Record<string, string>;
  explanation: string;
  rollbackTriggered: boolean;
}

const MAX_RETRIES = parseInt(process.env.DIAGNOSTIC_MAX_RETRIES || '3', 10);

/**
 * Diagnoses a failed Vercel deployment from its raw build logs and
 * proposes a targeted patch against the current file set.
 *
 * @param rawLogs             Raw build log text from fetchDeploymentLogs.
 * @param currentFiles         The full file map that was just deployed.
 * @param retryAttemptCount    0-indexed count of self-heal attempts so far for this build.
 */
export async function diagnoseAndPatch(
  rawLogs: string,
  currentFiles: Record<string, string>,
  retryAttemptCount: number
): Promise<DiagnosisResult> {
  // Hard boundary enforced before even calling the model — once we're at
  // the limit, there is nothing left to try automatically.
  if (retryAttemptCount >= MAX_RETRIES) {
    return {
      diagnosticStatus: 'BUILD_FAILURE',
      failureSummary: `Max self-heal retry boundary (${MAX_RETRIES}) reached without a working build.`,
      patchRequired: false,
      patchedFiles: {},
      explanation: '',
      rollbackTriggered: true,
    };
  }

  const systemInstruction = `You are the Diagnostic & Self-Healing Agent for a website builder. You receive raw Vercel build/deploy logs and the current project files. Identify the root cause of the failure and propose the smallest possible fix.

RULES:
- Only return files that actually need to change to fix the error. Do not regenerate unrelated files.
- Never use placeholder comments like "// ... keep existing code" — every file you return must be complete.
- If the log doesn't point to a fixable code issue (e.g. it's an account/billing/quota problem), set patch_required to false and explain why in failure_summary.`;

  const userInput = `BUILD LOGS:
${rawLogs || '[no logs available]'}

CURRENT PROJECT FILES (${Object.keys(currentFiles).length}):
${Object.entries(currentFiles)
  .map(([path, code]) => `--- File: ${path} ---\n${code.slice(0, 3000)}`)
  .join('\n\n')}

Attempt ${retryAttemptCount + 1} of ${MAX_RETRIES}.`;

  try {
    const response = await generateWithFallback({
      contents: userInput,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            diagnostic_status: { type: Type.STRING },
            failure_summary: { type: Type.STRING },
            patch_required: { type: Type.BOOLEAN },
            patched_files: { type: Type.STRING, description: `${FILES_FIELD_DESCRIPTION} Only include files that actually changed.` },
            explanation: { type: Type.STRING },
          },
          required: ['diagnostic_status', 'failure_summary', 'patch_required', 'explanation'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');

    return {
      diagnosticStatus: parsed.diagnostic_status === 'RUNTIME_ERROR' ? 'RUNTIME_ERROR' : 'BUILD_FAILURE',
      failureSummary: parsed.failure_summary || 'Unspecified build failure.',
      patchRequired: Boolean(parsed.patch_required),
      patchedFiles: parseFilesField(parsed.patched_files),
      explanation: parsed.explanation || '',
      rollbackTriggered: false,
    };
  } catch (err: any) {
    // If the diagnostic call itself fails (quota, network), don't loop —
    // surface it as a failure requiring rollback rather than retrying blind.
    return {
      diagnosticStatus: 'UNKNOWN',
      failureSummary: `Diagnostic Agent itself failed: ${err.message || 'unknown error'}`,
      patchRequired: false,
      patchedFiles: {},
      explanation: '',
      rollbackTriggered: true,
    };
  }
}
