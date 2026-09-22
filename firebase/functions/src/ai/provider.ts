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
import { fetchWithTimeout } from '../common/httpTimeout';

export type LlmTier = 'router' | 'filler' | 'reading';

/** Default model per tier — overridable via config/global.aiModels.
 *  reading defaults to FLASH (not Pro). Pro's $12/M output + low rate limits were
 *  BOTH the cost spike AND the "AI kept sending the same safety line" breakage
 *  (Pro rate-limited → real answer failed → canned fallback fired every turn).
 *  Flash is the safe floor so a cleared/missing config override can never
 *  silently bill Pro or re-trigger that. To run Pro deliberately, set
 *  config/global.aiModels.reading = 'gemini-pro-latest'. */
export const DEFAULT_MODELS: Record<LlmTier, string> = {
  router: 'gemini-flash-lite-latest',
  filler: 'gemini-flash-latest',
  reading: 'gemini-flash-latest',
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

// Rough USD-per-1M-token rates by coarse model family (paid tier, 2026) for an
// at-a-glance ₹ estimate in the LOGS ONLY — Google's invoice is authoritative.
// Cached input bills at ~10% of input (the 90% caching discount).
const USD_PER_M: Record<'pro' | 'flash' | 'lite', { in: number; out: number; cached: number }> = {
  pro: { in: 2.0, out: 12.0, cached: 0.20 },
  flash: { in: 0.75, out: 3.75, cached: 0.075 },
  lite: { in: 0.30, out: 2.50, cached: 0.03 },
};
const USD_TO_INR = 88;

/** Best-effort ₹ estimate for one call — for observability logs only. */
function estimateInr(model: string, inTok: number, outTok: number, cachedTok: number): number {
  const fam = /lite/i.test(model) ? 'lite' : /pro/i.test(model) ? 'pro' : 'flash';
  const r = USD_PER_M[fam];
  const billedIn = Math.max(0, inTok - cachedTok); // cached tokens bill at the cheaper rate
  const usd = (billedIn * r.in + cachedTok * r.cached + outTok * r.out) / 1_000_000;
  return Number((usd * USD_TO_INR).toFixed(4));
}

/** One conversational turn fed to the model. `model` = the assistant/astrologer. */
export interface LlmTurn {
  role: 'user' | 'model';
  text: string;
}

/** An image attached to the final user turn for a vision read (base64 payload). */
export interface LlmInlineImage {
  /** base64-encoded bytes (no data: prefix). */
  data: string;
  /** e.g. "image/jpeg", "image/png". */
  mimeType: string;
}

export interface LlmGenerateOptions {
  tier: LlmTier;
  /** The persona / task system prompt. Static per session → prompt-cacheable. */
  system: string;
  /** Rolling conversation history (already trimmed to the window by the caller). */
  history?: LlmTurn[];
  /** The current user burst to answer (appended as the final user turn). */
  userText: string;
  /** Inline images attached to the final user turn (vision read). When present,
   *  the provider's safety layer is LEFT ON unless disableSafety is set — a
   *  vision read of an explicit photo should be blocked, not described. */
  images?: LlmInlineImage[];
  /** Force strict JSON output (reading tier returns the envelope). */
  json?: boolean;
  /** Override the resolved model id (e.g. a pinned fallback). */
  model?: string;
  /** Per-call overrides for the tier defaults. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Turn the provider's safety layer OFF (BLOCK_NONE on all categories). Default
   *  ON for image reads (so explicit photos are blocked), OFF for text — where the
   *  persona owns its own boundaries and a canned "I can't answer that" is a fatal
   *  AI tell. Undefined → OFF for text-only calls, ON when images are attached. */
  disableSafety?: boolean;
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

  // Final user turn: the burst text plus any inline images (vision read). Gemini
  // takes text + inline_data parts in the same turn.
  const finalParts: Array<Record<string, unknown>> = [{ text: opts.userText }];
  for (const img of opts.images ?? []) {
    finalParts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  }
  const contents = [
    ...(opts.history ?? []).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: 'user' as const, parts: finalParts },
  ];

  // Safety: OFF by default for text (the persona owns its boundaries; a canned
  // "I can't answer that" is a fatal AI tell). When a photo is attached we leave
  // it ON unless explicitly disabled — an explicit image should be BLOCKED (→ the
  // engine stays silent and the NSFW pipeline removes it), never described.
  const safetyOff = opts.disableSafety ?? (opts.images?.length ? false : true);

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: opts.system }] },
    contents,
    generationConfig: {
      temperature: opts.temperature ?? tierDefault.temperature,
      maxOutputTokens: opts.maxOutputTokens ?? tierDefault.maxOutputTokens,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
    ...(safetyOff
      ? {
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }
      : {}),
  };

  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    // 30s ceiling: a normal reading returns well under this; a hung Gemini
    // connection aborts here (→ null → the engine stays silent / retries) instead
    // of holding the whole function invocation until the platform timeout.
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 30_000);
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
    // Observability only: per-call token usage + a rough ₹ estimate, so AI cost
    // per reply/model/user is visible in Cloud Logging (query "llm_usage").
    // `cachedTok` shows how much of the prompt Gemini served from cache. Wrapped
    // so logging can never affect the reply.
    try {
      const u = json?.usageMetadata;
      if (u) {
        const inTok = u.promptTokenCount ?? 0;
        const thoughtTok = u.thoughtsTokenCount ?? 0;
        const outTok = (u.candidatesTokenCount ?? 0) + thoughtTok;
        const cachedTok = u.cachedContentTokenCount ?? 0;
        logger.info('llm_usage', {
          tier: opts.tier, model, inTok, outTok, thoughtTok, cachedTok,
          estInr: estimateInr(model, inTok, outTok, cachedTok),
        });
      }
    } catch { /* logging must never break a reply */ }
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
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
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
