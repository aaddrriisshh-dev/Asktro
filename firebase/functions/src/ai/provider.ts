/**
 * AI astrologer — model-agnostic LLM adapter.
 *
 * The engine never talks to a provider SDK directly; it calls `llmGenerate()`
 * with a TIER and gets back plain text. Today the only provider is Gemini (REST
 * `generateContent`), but the interface is deliberately provider-neutral so we
 * can blind-test / swap to Claude by config without touching the engine.
 *
 * 3-tier routing is the cost lever — each turn runs on the CHEAPEST model that
 * can do the job, so the premium "reading" brain only fires when we actually
 * interpret a chart:
 *   - router  → cheapest  (intent detection, birth-detail slot parsing)
 *   - filler  → cheap     (greetings, clarifiers, small talk, "let me check…")
 *   - reading → premium   (the grounded kundli interpretation)
 *
 * Model IDs are config-overridable (config/global.ai.models) so we can pin,
 * upgrade, or A/B a model without a redeploy. Defaults are the tested-good
 * Gemini IDs locked Jul 2026. Follows the ProKerala caller's contract: returns
 * the text, or null on ANY failure — the caller decides what to do (never
 * fabricates a reply on an outage).
 */
import { logger } from 'firebase-functions/v2';

export type LlmTier = 'router' | 'filler' | 'reading';

/** Default model per tier — overridable via config/global.ai.models. */
export const DEFAULT_MODELS: Record<LlmTier, string> = {
  router: 'gemini-flash-lite-latest',
  filler: 'gemini-flash-latest',
  reading: 'gemini-pro-latest',
};

/**
 * Sensible per-tier generation defaults. Reading runs a touch warmer for a
 * human, non-robotic voice; router runs cold for deterministic parsing. Output
 * is capped everywhere — long replies are both an AI tell AND a cost leak.
 */
// NOTE: the current Gemini models are "thinking" models — they spend output
// tokens reasoning BEFORE emitting the answer, and that counts against
// maxOutputTokens. A tight cap truncates the JSON mid-string. These budgets give
// thinking room + the short reply; the reply LENGTH is capped by the prompt (2-3
// lines), not by starving the token budget.
const TIER_DEFAULTS: Record<LlmTier, { temperature: number; maxOutputTokens: number }> = {
  router: { temperature: 0.0, maxOutputTokens: 1024 },
  filler: { temperature: 0.8, maxOutputTokens: 1024 },
  reading: { temperature: 0.9, maxOutputTokens: 3072 },
};

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** One conversational turn fed to the model. `model` = the assistant/astrologer. */
export interface LlmTurn {
  role: 'user' | 'model';
  text: string;
}

export interface LlmGenerateOptions {
  tier: LlmTier;
  /** The persona / task system prompt. Static per session → prompt-cacheable. */
  system: string;
  /** Rolling conversation history (already trimmed to the window by the caller). */
  history?: LlmTurn[];
  /** The current user burst to answer (appended as the final user turn). */
  userText: string;
  /** Force strict JSON output (reading tier returns the envelope). */
  json?: boolean;
  /** Override the resolved model id (e.g. a pinned fallback). */
  model?: string;
  /** Per-call overrides for the tier defaults. */
  temperature?: number;
  maxOutputTokens?: number;
}

/** Resolve the model id for a tier, honouring config overrides then defaults. */
export function resolveModel(
  tier: LlmTier,
  configModels?: Partial<Record<LlmTier, string>>,
): string {
  return configModels?.[tier] || DEFAULT_MODELS[tier];
}

/**
 * Generate a completion. Returns the model's text, or null on any failure
 * (network, non-200, empty/blocked candidate). NEVER throws — the reply engine
 * must degrade gracefully, never crash a live paid chat.
 */
export async function llmGenerate(
  opts: LlmGenerateOptions,
  apiKey: string,
  configModels?: Partial<Record<LlmTier, string>>,
): Promise<string | null> {
  if (!apiKey) {
    logger.error('llmGenerate: missing API key');
    return null;
  }
  const model = opts.model || resolveModel(opts.tier, configModels);
  const tierDefault = TIER_DEFAULTS[opts.tier];

  const contents = [
    ...(opts.history ?? []).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: 'user' as const, parts: [{ text: opts.userText }] },
  ];

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: opts.system }] },
    contents,
    generationConfig: {
      temperature: opts.temperature ?? tierDefault.temperature,
      maxOutputTokens: opts.maxOutputTokens ?? tierDefault.maxOutputTokens,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Read as text first so we can log the provider's exact error on failure.
    const raw = await res.text().catch(() => '');
    if (!res.ok) {
      logger.error('llmGenerate upstream error', {
        tier: opts.tier,
        model,
        status: res.status,
        body: raw.slice(0, 600),
      });
      return null;
    }
    let json: GeminiResponse | null = null;
    try {
      json = raw ? (JSON.parse(raw) as GeminiResponse) : null;
    } catch {
      json = null;
    }
    const text = extractText(json);
    if (!text) {
      logger.error('llmGenerate empty/blocked candidate', {
        tier: opts.tier,
        model,
        finishReason: json?.candidates?.[0]?.finishReason,
        promptFeedback: json?.promptFeedback,
      });
      return null;
    }
    return text;
  } catch (e) {
    logger.error('llmGenerate failed', {
      tier: opts.tier,
      model,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

// ---- Gemini response shapes (only the fields we read) ----
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: unknown;
}

/** Join all text parts of the first candidate; empty string if none. */
function extractText(json: GeminiResponse | null): string {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!parts?.length) return '';
  return parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}
