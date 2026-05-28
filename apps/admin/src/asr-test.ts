/**
 * ASR provider catalog + transcription dispatcher.
 *
 * The admin "ASR" page stores provider configs in D1 (asr_provider_config:
 * providerType + model + encrypted apiKey + isActive) exactly like the LLM
 * and Search configs. This module supplies:
 *   - ASR_PROVIDER_PRESETS: the catalog of supported provider types, their
 *     default model, and whether they need an API key.
 *   - runAsrProvider(): dispatch a recorded clip to one provider using a
 *     (already-decrypted) key + model. Used by the integrated smoke test
 *     and, later, by the production /api/transcribe path.
 */

import { encode as encodeMsgpack } from "@msgpack/msgpack";

export interface AsrEnv {
  AI?: Ai;
  CF_AIG_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
}

export interface AsrProviderPreset {
  /** Display label in the admin UI. */
  label: string;
  /** Pre-filled model field when adding this provider type. */
  defaultModel: string;
  /** Whether an API key is required (cf-workers-ai bills via the AI binding). */
  needsKey: boolean;
  /** Placeholder text for the key input. */
  keyPlaceholder: string;
  /** Rough cost, shown as a hint. */
  cost: string;
}

export const ASR_PROVIDER_PRESETS: Record<string, AsrProviderPreset> = {
  "xai-grok": {
    label: "xAI Grok STT",
    defaultModel: "grok-stt",
    needsKey: true,
    keyPlaceholder: "xai-...",
    cost: "$0.10/hr",
  },
  "cf-workers-ai": {
    label: "CF Workers AI Whisper",
    defaultModel: "@cf/openai/whisper-large-v3-turbo",
    needsKey: false,
    keyPlaceholder: "(none — billed via Workers AI binding)",
    cost: "$0.00051/min",
  },
  "groq-whisper": {
    label: "Groq Whisper",
    defaultModel: "whisper-large-v3-turbo",
    needsKey: true,
    keyPlaceholder: "gsk_...",
    cost: "$0.04/hr",
  },
  fish: {
    label: "Fish Audio",
    defaultModel: "v1/asr",
    needsKey: true,
    keyPlaceholder: "fish api key",
    cost: "~$0.30/hr",
  },
  elevenlabs: {
    label: "ElevenLabs Scribe v1",
    defaultModel: "scribe_v1",
    needsKey: true,
    keyPlaceholder: "xi-...",
    cost: "$0.40/hr",
  },
};

export interface RunAsrOpts {
  providerType: string;
  /** Model override; falls back to the preset default. */
  model?: string;
  /** Decrypted API key (omit for cf-workers-ai). */
  apiKey?: string;
  audio: Uint8Array;
  mime: string;
  filename: string;
  /** BCP-47 language hint; "" / undefined = auto-detect. */
  lang?: string;
  env: AsrEnv;
}

/** Transcribe one clip with one provider. Returns text, throws on failure. */
export async function runAsrProvider(opts: RunAsrOpts): Promise<string> {
  const { providerType } = opts;
  switch (providerType) {
    case "cf-workers-ai":
      return runWorkersAi(opts);
    case "xai-grok":
      return runXaiGrok(opts);
    case "groq-whisper":
      return runGroqWhisper(opts);
    case "fish":
      return runFish(opts);
    case "elevenlabs":
      return runElevenLabs(opts);
    default:
      throw new Error(`unknown ASR provider: ${providerType}`);
  }
}

// 2-letter language code from a BCP-47 tag ("zh-CN" → "zh"); "" if unusable.
function langCode(lang?: string): string {
  const c = (lang || "").toLowerCase().split("-")[0];
  return /^[a-z]{2}$/.test(c) ? c : "";
}

// Chunked base64 — String.fromCharCode(...bytes) overflows the stack on
// large buffers, so encode in 32 KB windows.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ── CF Workers AI whisper (base64 string input; task=transcribe to keep
//    the source language — "translate" forces English). ──────────────
async function runWorkersAi(opts: RunAsrOpts): Promise<string> {
  const { audio, lang, env, model } = opts;
  if (!env.AI) throw new Error("AI binding not configured");
  const code = langCode(lang);
  const result = (await env.AI.run(
    (model || ASR_PROVIDER_PRESETS["cf-workers-ai"].defaultModel) as never,
    {
      audio: toBase64(audio),
      task: "transcribe",
      ...(code ? { language: code } : {}),
    } as never,
  )) as { text?: string };
  if (typeof result.text !== "string") throw new Error("workers-ai: missing text");
  return result.text.trim();
}

// ── xAI Grok STT — direct (api.x.ai/v1/stt) with the configured key, or
//    via AI Gateway unified billing if no key is set. ──────────────────
async function runXaiGrok(opts: RunAsrOpts): Promise<string> {
  const { audio, mime, filename, apiKey, env } = opts;
  const useGateway = !!env.CLOUDFLARE_ACCOUNT_ID && !!env.AI_GATEWAY_ID && !!env.CF_AIG_TOKEN;
  const url = useGateway
    ? `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/xai/v1/stt`
    : "https://api.x.ai/v1/stt";

  if (!apiKey && !useGateway) {
    throw new Error("xai-grok: need an API key (or AI Gateway unified billing)");
  }
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  if (useGateway && env.CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;

  const fd = new FormData();
  fd.set("file", new Blob([audio.buffer as ArrayBuffer], { type: mime }), filename);

  const res = await fetch(url, { method: "POST", headers, body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`xai-grok ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== "string") throw new Error("xai-grok: missing text");
  return json.text.trim();
}

// ── Groq Whisper (OpenAI-compatible) — direct or via AI Gateway. ───────
async function runGroqWhisper(opts: RunAsrOpts): Promise<string> {
  const { audio, mime, filename, lang, apiKey, env, model } = opts;
  const useGateway = !!env.CLOUDFLARE_ACCOUNT_ID && !!env.AI_GATEWAY_ID && !!env.CF_AIG_TOKEN;
  const url = useGateway
    ? `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/groq/audio/transcriptions`
    : "https://api.groq.com/openai/v1/audio/transcriptions";

  if (!apiKey && !useGateway) {
    throw new Error("groq: need an API key (or AI Gateway unified billing)");
  }
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  if (useGateway && env.CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;

  const fd = new FormData();
  fd.set("file", new Blob([audio.buffer as ArrayBuffer], { type: mime }), filename);
  fd.set("model", model || ASR_PROVIDER_PRESETS["groq-whisper"].defaultModel);
  const code = langCode(lang);
  if (code) fd.set("language", code);

  const res = await fetch(url, { method: "POST", headers, body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`groq ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== "string") throw new Error("groq: missing text");
  return json.text.trim();
}

// ── Fish Audio /v1/asr — msgpack body, sync. ─────────────────────────
async function runFish(opts: RunAsrOpts): Promise<string> {
  const { audio, lang, apiKey } = opts;
  if (!apiKey) throw new Error("fish: missing API key");
  const code = langCode(lang);
  const body = encodeMsgpack({
    audio,
    ...(code ? { language: code } : {}),
    ignore_timestamps: true,
  });
  const res = await fetch("https://api.fish.audio/v1/asr", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/msgpack" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`fish ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== "string") throw new Error("fish: missing text");
  return json.text.trim();
}

// ── ElevenLabs Scribe v1 via AI Gateway. ─────────────────────────────
async function runElevenLabs(opts: RunAsrOpts): Promise<string> {
  const { audio, mime, filename, lang, apiKey, env, model } = opts;
  if (!apiKey) throw new Error("elevenlabs: missing API key");
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.AI_GATEWAY_ID) {
    throw new Error("elevenlabs: AI Gateway not configured");
  }
  const url =
    `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/` +
    `${env.AI_GATEWAY_ID}/elevenlabs/v1/speech-to-text`;

  const fd = new FormData();
  fd.set("model_id", model || ASR_PROVIDER_PRESETS["elevenlabs"].defaultModel);
  const code = langCode(lang);
  if (code) fd.set("language_code", code);
  fd.set("file", new Blob([audio.buffer as ArrayBuffer], { type: mime }), filename);

  const headers: Record<string, string> = { "xi-api-key": apiKey };
  if (env.CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;

  const res = await fetch(url, { method: "POST", headers, body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`elevenlabs ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== "string") throw new Error("elevenlabs: missing text");
  return json.text.trim();
}
