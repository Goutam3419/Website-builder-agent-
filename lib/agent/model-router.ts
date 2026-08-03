import { GoogleGenAI } from '@google/genai';
import { UserSettings } from '../db';

// Lets a user pick which model powers generation: Gemini (default, uses the
// platform's own GEMINI_API_KEY) or Claude (uses the user's own Anthropic
// API key, entered in Settings). Both paths are asked to return ONLY a JSON
// object matching the given shape description — Claude doesn't have Gemini's
// native responseSchema feature, so we emulate it via prompt instructions
// and parse the returned text.

const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
});

export interface ModelCallParams {
  systemPrompt: string;
  userPrompt: string;
  settings: UserSettings | null;
  jsonShapeHint: string; // human-readable description of the expected JSON shape, injected into the prompt for non-Gemini models
}

export interface ModelCallResult {
  success: boolean;
  rawText: string;
  modelUsed: 'gemini' | 'claude';
  error?: string;
}

function resolveModelChoice(settings: UserSettings | null): 'gemini' | 'claude' {
  if (settings?.preferred_model === 'claude' && settings?.anthropic_api_key) {
    return 'claude';
  }
  return 'gemini';
}

// Strips ```json ... ``` fences some models wrap JSON responses in.
function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<ModelCallResult> {
  try {
    const response = await geminiClient.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });
    return { success: true, rawText: response.text || '', modelUsed: 'gemini' };
  } catch (err: any) {
    return { success: false, rawText: '', modelUsed: 'gemini', error: err.message || 'Gemini call failed' };
  }
}

async function callClaude(systemPrompt: string, userPrompt: string, apiKey: string, jsonShapeHint: string): Promise<ModelCallResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8192,
        system: `${systemPrompt}\n\nCRITICAL: Respond with ONLY a raw JSON object, no markdown fences, no commentary. Expected shape:\n${jsonShapeHint}`,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, rawText: '', modelUsed: 'claude', error: errData.error?.message || `Claude HTTP ${res.status}` };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    return { success: true, rawText: stripJsonFences(text), modelUsed: 'claude' };
  } catch (err: any) {
    return { success: false, rawText: '', modelUsed: 'claude', error: err.message || 'Claude call failed' };
  }
}

// Main entrypoint: routes to whichever model the user has configured,
// falling back to Gemini automatically if Claude fails (e.g. invalid key)
// so a generation request never hard-fails just because of a model outage.
export async function callAgentModel(params: ModelCallParams): Promise<ModelCallResult> {
  const choice = resolveModelChoice(params.settings);

  if (choice === 'claude') {
    const result = await callClaude(params.systemPrompt, params.userPrompt, params.settings!.anthropic_api_key!, params.jsonShapeHint);
    if (result.success) return result;
    // Fall back to Gemini rather than failing the whole request
    console.warn('[model-router] Claude call failed, falling back to Gemini:', result.error);
    return callGemini(params.systemPrompt, params.userPrompt);
  }

  return callGemini(params.systemPrompt, params.userPrompt);
}
