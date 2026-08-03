// Shared Gemini client with automatic model fallback.
//
// Why this exists: the app previously created a separate GoogleGenAI
// client in 7 different files, each hardcoding 'gemini-3.6-flash'
// directly in the generateContent call. When that one model's free-tier
// daily quota (20 requests/day, per the actual 429 response seen in
// production) is exhausted, EVERY call site fails independently with
// no fallback — the whole app goes down until the quota resets.
//
// Fix: one shared client, one call path (`generateWithFallback`), and a
// configurable list of fallback models. On a quota-exhaustion error
// specifically (429 / RESOURCE_EXHAUSTED) for the current model, it
// automatically retries the SAME request against the next model in the
// list. Non-quota errors (bad request, network failure, etc.) are NOT
// retried across models — retrying a malformed request against a
// different model wouldn't fix it, so those still throw immediately.

import { GoogleGenAI } from '@google/genai';

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Comma-separated env override, e.g. "gemini-3.6-flash,gemini-2.5-flash,gemini-2.0-flash"
// Falls back to a sensible default chain if not set: try the newest
// model first, then step down to older models whose free-tier quotas
// are typically more established/generous.
const DEFAULT_MODEL_CHAIN = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

export function getModelChain(): string[] {
  const envChain = process.env.GEMINI_MODEL_CHAIN;
  if (envChain && envChain.trim()) {
    return envChain.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return DEFAULT_MODEL_CHAIN;
}

export function isQuotaExhaustedError(err: any): boolean {
  const message = (err?.message || String(err)).toLowerCase();
  return (
    message.includes('resource_exhausted') ||
    message.includes('quota') ||
    message.includes('429') ||
    err?.status === 429 ||
    err?.code === 429
  );
}

export interface GenerateWithFallbackParams {
  contents: string;
  config?: Record<string, any>;
  models?: string[]; // override the default chain for this call, if needed
}

export interface GenerateWithFallbackResult {
  text: string;
  modelUsed: string;
  fellBackFrom?: string[]; // models that were tried and quota-exhausted before this one succeeded
}

/**
 * Calls Gemini's generateContent, automatically falling back through
 * getModelChain() if the current model's quota is exhausted. Returns
 * which model actually served the request, so callers/logs can tell
 * when a fallback happened.
 */
export async function generateWithFallback(params: GenerateWithFallbackParams): Promise<GenerateWithFallbackResult> {
  const chain = params.models && params.models.length > 0 ? params.models : getModelChain();
  const triedModels: string[] = [];
  let lastError: any;

  for (const model of chain) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return {
        text: response.text || '',
        modelUsed: model,
        fellBackFrom: triedModels.length > 0 ? triedModels : undefined,
      };
    } catch (err) {
      lastError = err;
      if (!isQuotaExhaustedError(err)) {
        // Not a quota issue — trying another model won't help a bad
        // request or malformed schema. Fail fast instead of masking it.
        throw err;
      }
      console.warn(`[geminiClient] Model "${model}" quota exhausted, falling back to next model in chain.`);
      triedModels.push(model);
    }
  }

  // Every model in the chain was quota-exhausted.
  throw lastError;
}
