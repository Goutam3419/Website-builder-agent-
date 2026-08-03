// Why this exists: Gemini's responseSchema (a constrained subset of
// OpenAPI 3.0) works reliably for OBJECT types when their `properties`
// are explicitly listed. A files map is inherently dynamic-keyed
// (filepath -> content, paths unknown ahead of time), so it CANNOT have
// fixed `properties` — and an OBJECT schema entry with no `properties`
// gives the model no defined shape to fill against. In practice this
// made Gemini frequently return `{}` for `files` even while writing a
// full, detailed `plan` and `reasoning` right next to it in the same
// JSON response — the exact bug reported: confident chat summary, empty
// live site.
//
// Fix: ask for `files` as a STRING containing JSON.stringify'd content
// instead of a raw OBJECT. A STRING field has a concrete, fillable shape
// (schema-wise it's just "text"), so structured output handles it the
// same way it handles `reasoning` or `explanation` — reliably.

/**
 * Parses a Gemini response field that should be a filepath->content map.
 * Handles both the new STRING-encoded format (JSON.stringify'd by the
 * model) and, defensively, the case where the SDK/model still returns a
 * real object directly (older prompts, or a future schema change).
 */
export function parseFilesField(raw: unknown): Record<string, string> {
  if (!raw) return {};

  if (typeof raw === 'object') {
    // Already a real object — use as-is (defensive backward-compat path).
    return raw as Record<string, string>;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      console.warn('[parseFilesField] Model returned a non-JSON string for files:', trimmed.slice(0, 200));
      return {};
    }
  }

  return {};
}

// Shared schema description text so every call site asks for the same
// format consistently — copy/pasted description drift was part of how
// this bug went unnoticed across 5 different call sites originally.
export const FILES_FIELD_DESCRIPTION =
  'A JSON-stringified object (use JSON.stringify, not a raw object) mapping filepath -> full file content. Example valid value: "{\\"index.html\\": \\"<!DOCTYPE html>...\\"}". Must be valid JSON when parsed with JSON.parse — this is a STRING field, not an object field.';
