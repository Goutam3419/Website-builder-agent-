// Risk Gate — deterministic pre-execution safety check.
//
// Why rule-based and not LLM-judged: an LLM asked to self-report a risk
// score can be talked around ("it's just a preview branch, totally safe")
// or simply misjudge novel phrasing. A fixed keyword/pattern match can't
// be argued with — it either matches the destructive-action signature or
// it doesn't. This mirrors the PDF spec's risk tiers (LOW / MEDIUM / HIGH)
// but makes the HIGH gate non-negotiable instead of advisory.
//
// This intentionally does NOT try to be clever about intent — false
// positives (blocking a harmless prompt that happens to contain "delete")
// are cheap: the user just confirms. False negatives (a destructive prompt
// slipping through) are the expensive failure mode, so the patterns below
// are deliberately broad.

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskAssessment {
  riskScore: number; // 0.00 - 1.00
  tier: RiskTier;
  requiresApproval: boolean;
  reason: string;
  matchedSignals: string[];
}

interface RiskPattern {
  pattern: RegExp;
  weight: number;
  label: string;
}

// R >= 0.70 — halt and require explicit human confirmation.
const HIGH_RISK_PATTERNS: RiskPattern[] = [
  { pattern: /\b(delete|wipe|clear)\b[^.]{0,30}\b(all|entire|everything|whole)\b/i, weight: 0.9, label: 'bulk deletion' },
  { pattern: /\bdrop\b[^.]{0,15}\btable\b/i, weight: 0.95, label: 'database table drop' },
  { pattern: /\btruncate\b/i, weight: 0.9, label: 'table truncation' },
  { pattern: /\bproduction\b[^.]{0,30}\b(delete|remove|reset|wipe|overwrite)\b/i, weight: 0.85, label: 'production-affecting deletion' },
  { pattern: /\bforce[- ]?push\b/i, weight: 0.7, label: 'force push (history rewrite)' },
  { pattern: /\bdelete\b[^.]{0,20}\b(repo|repository|project)\b/i, weight: 0.85, label: 'repository deletion' },
  { pattern: /\bremove\b[^.]{0,20}\b(database|db)\b/i, weight: 0.8, label: 'database removal' },
  { pattern: /\breset\b[^.]{0,20}\b(everything|entire project|whole project|from scratch)\b/i, weight: 0.75, label: 'full project reset' },
  { pattern: /\brevoke\b[^.]{0,20}\baccess\b/i, weight: 0.7, label: 'access revocation' },
];

// 0.30 <= R < 0.70 — logged, not blocked, but noted in the reason string.
const MEDIUM_RISK_PATTERNS: RiskPattern[] = [
  { pattern: /\benvironment variable\b|\bapi key\b|\bsecret\b/i, weight: 0.45, label: 'environment/secret configuration' },
  { pattern: /\bmigration\b|\bschema change\b|\balter\b[^.]{0,15}\btable\b/i, weight: 0.5, label: 'schema-adjacent change' },
  { pattern: /\bdelete\b[^.]{0,20}\b(page|section|component)\b/i, weight: 0.35, label: 'single-page/component deletion' },
];

export function assessRisk(userPrompt: string): RiskAssessment {
  const text = userPrompt.toLowerCase();
  let score = 0;
  const matched: string[] = [];

  for (const { pattern, weight, label } of HIGH_RISK_PATTERNS) {
    if (pattern.test(text)) {
      score = Math.max(score, weight);
      matched.push(label);
    }
  }

  // Only check MEDIUM patterns if nothing HIGH already fired — no point
  // diluting a HIGH-risk reason string with lower-weight matches.
  if (score < 0.7) {
    for (const { pattern, weight, label } of MEDIUM_RISK_PATTERNS) {
      if (pattern.test(text)) {
        score = Math.max(score, weight);
        matched.push(label);
      }
    }
  }

  const tier: RiskTier = score >= 0.7 ? 'HIGH' : score >= 0.3 ? 'MEDIUM' : 'LOW';

  return {
    riskScore: Math.round(score * 100) / 100,
    tier,
    requiresApproval: tier === 'HIGH',
    reason: matched.length > 0 ? `Detected: ${matched.join(', ')}` : 'No destructive signals detected.',
    matchedSignals: matched,
  };
}

// Recognizes an explicit "yes, go ahead" reply to a pending HIGH-risk
// confirmation prompt. Deliberately narrow — a vague "ok" or "theek hai"
// does NOT count, to avoid a destructive action slipping through on an
// ambiguous acknowledgement that was really about something else.
const CONFIRMATION_PATTERNS: RegExp[] = [
  /\bconfirm(ed)?\b/i,
  /\bapprov(e|ed)\b/i,
  /\bproceed\b/i,
  /\bgo ahead\b/i,
  /\byes\b.*\b(do it|karo|kar do|proceed|confirm)\b/i,
  /\bhaan\b.*\b(karo|kar do|proceed|confirm)\b/i,
];

export function isConfirmationMessage(text: string): boolean {
  const trimmed = text.trim();
  return CONFIRMATION_PATTERNS.some((p) => p.test(trimmed));
}
