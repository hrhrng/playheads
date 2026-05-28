/**
 * ASR smoke-test handler — POST /api/asr-test.
 *
 * Lets the admin operator record audio in-browser, fan it out to one or
 * many providers in parallel, and compare transcripts + latencies side
 * by side. Backs the "ASR Test" page in serveHTML.
 *
 * Multipart in:
 *   - `audio`     : File (any format browser MediaRecorder emits)
 *   - `lang`      : BCP-47 language tag, e.g. "zh" / "en" — provider hint
 *   - `providers` : comma-separated list of provider keys to run
 *                   (e.g. "cf-workers-ai,xai-grok,fish")
 *   - `apiKeys`   : optional JSON `{ fish?, elevenlabs?, xai?, groq? }`
 *                   for ad-hoc BYOK testing without redeploying secrets.
 *
 * JSON out:
 *   {
 *     results: [
 *       { provider, model, text?, error?, latencyMs, bytes }
 *     ]
 *   }
 */

import { encode as encodeMsgpack } from "@msgpack/msgpack";

export interface AsrTestEnv {
  AI?: Ai;
  CF_AIG_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  FISH_AUDIO_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  XAI_API_KEY?: string;
  GROQ_API_KEY?: string;
}

export const ASR_PROVIDERS = [
  {
    key: "cf-workers-ai",
    label: "CF Workers AI",
    model: "@cf/openai/whisper-large-v3-turbo",
    cost: "$0.00051/min",
    unifiedBilling: true,
  },
  {
    key: "xai-grok",
    label: "xAI Grok STT",
    model: "grok-stt (default)",
    cost: "$0.10/hr",
    unifiedBilling: true, // via AI Gateway
  },
  {
    key: "groq-whisper",
    label: "Groq Whisper-v3-turbo",
    model: "whisper-large-v3-turbo",
    cost: "$0.04/hr",
    unifiedBilling: true, // via AI Gateway
  },
  {
    key: "fish",
    label: "Fish Audio",
    model: "/v1/asr",
    cost: "~$0.30/hr",
    unifiedBilling: false,
  },
  {
    key: "elevenlabs",
    label: "ElevenLabs Scribe v1",
    model: "scribe_v1",
    cost: "$0.40/hr",
    unifiedBilling: false,
  },
] as const;

type ProviderKey = (typeof ASR_PROVIDERS)[number]["key"];

interface OverrideKeys {
  fish?: string;
  elevenlabs?: string;
  xai?: string;
  groq?: string;
}

interface ProviderResult {
  provider: ProviderKey;
  model: string;
  text?: string;
  error?: string;
  latencyMs: number;
  bytes: number;
}

export async function handleAsrTest(
  request: Request,
  env: AsrTestEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "multipart required" }, { status: 400 });
  }

  const entry = form.get("audio");
  if (
    !entry ||
    typeof entry === "string" ||
    typeof (entry as { arrayBuffer?: unknown }).arrayBuffer !== "function"
  ) {
    return Response.json({ error: "audio field required" }, { status: 400 });
  }
  const audioFile = entry as unknown as {
    name?: string;
    type: string;
    size: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  };

  const lang = ((form.get("lang") as string | null)?.trim() || "en").toLowerCase();
  const providers = ((form.get("providers") as string | null) || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ProviderKey[];
  if (providers.length === 0) {
    return Response.json({ error: "providers field required" }, { status: 400 });
  }

  let overrideKeys: OverrideKeys = {};
  const apiKeysRaw = form.get("apiKeys") as string | null;
  if (apiKeysRaw) {
    try {
      overrideKeys = JSON.parse(apiKeysRaw);
    } catch {
      /* ignore — fall back to env */
    }
  }

  // Buffer the audio once; each provider gets its own Uint8Array view
  // (FormData / Blob are not safely reusable across multiple fetch bodies).
  const audioBuf = new Uint8Array(await audioFile.arrayBuffer());
  const mime = audioFile.type || "audio/webm";
  const filename = audioFile.name || "recording.webm";

  const results = await Promise.all(
    providers.map((p) =>
      runOne(p, audioBuf, mime, filename, lang, env, overrideKeys),
    ),
  );

  return Response.json({ results });
}

async function runOne(
  provider: ProviderKey,
  audio: Uint8Array,
  mime: string,
  filename: string,
  lang: string,
  env: AsrTestEnv,
  keys: OverrideKeys,
): Promise<ProviderResult> {
  const card = ASR_PROVIDERS.find((p) => p.key === provider);
  const model = card?.model ?? "unknown";
  const start = Date.now();
  try {
    let text: string;
    switch (provider) {
      case "cf-workers-ai":
        text = await runWorkersAi(audio, lang, env);
        break;
      case "xai-grok":
        text = await runXaiGrok(audio, mime, filename, lang, env, keys.xai);
        break;
      case "groq-whisper":
        text = await runGroqWhisper(audio, mime, filename, lang, env, keys.groq);
        break;
      case "fish":
        text = await runFish(audio, lang, env, keys.fish);
        break;
      case "elevenlabs":
        text = await runElevenLabs(audio, mime, filename, lang, env, keys.elevenlabs);
        break;
      default:
        throw new Error(`unknown provider: ${provider}`);
    }
    return {
      provider,
      model,
      text,
      latencyMs: Date.now() - start,
      bytes: audio.byteLength,
    };
  } catch (err) {
    return {
      provider,
      model,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
      bytes: audio.byteLength,
    };
  }
}

// ── CF Workers AI whisper-large-v3-turbo ─────────────────────────
//
// whisper-large-v3-turbo expects `audio` as a BASE64-ENCODED STRING
// (not a byte array — that's the classic @cf/openai/whisper schema, and
// passing number[] here gets rejected with code 5006 type-mismatch).
async function runWorkersAi(
  audio: Uint8Array,
  lang: string,
  env: AsrTestEnv,
): Promise<string> {
  if (!env.AI) throw new Error("AI binding not configured");
  const langCode = lang.split("-")[0];
  const result = (await env.AI.run("@cf/openai/whisper-large-v3-turbo" as never, {
    audio: toBase64(audio),
    ...(/^[a-z]{2}$/.test(langCode) ? { language: langCode } : {}),
  } as never)) as { text?: string };
  if (typeof result.text !== "string") {
    throw new Error("workers-ai: missing text");
  }
  return result.text.trim();
}

// Chunked base64 — String.fromCharCode(...bytes) overflows the call
// stack for large buffers, so encode in 32 KB windows.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ── xAI Grok STT (via AI Gateway unified billing if no BYOK) ────────
//
// Direct URL: https://api.x.ai/v1/stt (multipart, file=)
// AI Gateway: https://gateway.ai.cloudflare.com/v1/{acct}/{gw}/xai/v1/stt
//
// When a BYOK key is supplied we hit the gateway with the user's key so
// observability still applies. Without BYOK we rely on the gateway's
// stored key (unified billing) — auth flows via `cf-aig-authorization`.
async function runXaiGrok(
  audio: Uint8Array,
  mime: string,
  filename: string,
  _lang: string,
  env: AsrTestEnv,
  byokKey?: string,
): Promise<string> {
  const useGateway = !!env.CLOUDFLARE_ACCOUNT_ID && !!env.AI_GATEWAY_ID && !!env.CF_AIG_TOKEN;
  const url = useGateway
    ? `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/xai/v1/stt`
    : "https://api.x.ai/v1/stt";

  const headers: Record<string, string> = {};
  const apiKey = byokKey || env.XAI_API_KEY;
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  if (useGateway && env.CF_AIG_TOKEN) {
    headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
  }
  if (!apiKey && !useGateway) {
    throw new Error("xai-grok: need XAI_API_KEY or AI Gateway unified billing");
  }

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

// ── Groq Whisper-large-v3-turbo (OpenAI-compatible) via AI Gateway ──
//
// Direct: https://api.groq.com/openai/v1/audio/transcriptions
// AI GW : https://gateway.ai.cloudflare.com/v1/{acct}/{gw}/groq/audio/transcriptions
async function runGroqWhisper(
  audio: Uint8Array,
  mime: string,
  filename: string,
  lang: string,
  env: AsrTestEnv,
  byokKey?: string,
): Promise<string> {
  const useGateway = !!env.CLOUDFLARE_ACCOUNT_ID && !!env.AI_GATEWAY_ID && !!env.CF_AIG_TOKEN;
  const url = useGateway
    ? `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/groq/audio/transcriptions`
    : "https://api.groq.com/openai/v1/audio/transcriptions";

  const headers: Record<string, string> = {};
  const apiKey = byokKey || env.GROQ_API_KEY;
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  if (useGateway && env.CF_AIG_TOKEN) {
    headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
  }
  if (!apiKey && !useGateway) {
    throw new Error("groq: need GROQ_API_KEY or AI Gateway unified billing");
  }

  const fd = new FormData();
  fd.set("file", new Blob([audio.buffer as ArrayBuffer], { type: mime }), filename);
  fd.set("model", "whisper-large-v3-turbo");
  const langCode = lang.split("-")[0];
  if (/^[a-z]{2}$/.test(langCode)) fd.set("language", langCode);

  const res = await fetch(url, { method: "POST", headers, body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`groq ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== "string") throw new Error("groq: missing text");
  return json.text.trim();
}

// ── Fish Audio /v1/asr — msgpack body, sync. ─────────────────────
async function runFish(
  audio: Uint8Array,
  lang: string,
  env: AsrTestEnv,
  byokKey?: string,
): Promise<string> {
  const apiKey = byokKey || env.FISH_AUDIO_API_KEY;
  if (!apiKey) throw new Error("fish: missing FISH_AUDIO_API_KEY");

  const langCode = lang.split("-")[0];
  const body = encodeMsgpack({
    audio,
    ...(/^[a-z]{2}$/.test(langCode) ? { language: langCode } : {}),
    ignore_timestamps: true,
  });

  const res = await fetch("https://api.fish.audio/v1/asr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/msgpack",
    },
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

// ── ElevenLabs Scribe v1 via AI Gateway clash ────────────────────
async function runElevenLabs(
  audio: Uint8Array,
  mime: string,
  filename: string,
  lang: string,
  env: AsrTestEnv,
  byokKey?: string,
): Promise<string> {
  const apiKey = byokKey || env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("elevenlabs: missing ELEVENLABS_API_KEY");
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.AI_GATEWAY_ID) {
    throw new Error("elevenlabs: AI Gateway not configured");
  }

  const url =
    `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/` +
    `${env.AI_GATEWAY_ID}/elevenlabs/v1/speech-to-text`;

  const fd = new FormData();
  fd.set("model_id", "scribe_v1");
  const langCode = lang.split("-")[0];
  if (/^[a-z]{2}$/.test(langCode)) fd.set("language_code", langCode);
  fd.set("file", new Blob([audio.buffer as ArrayBuffer], { type: mime }), filename);

  const headers: Record<string, string> = { "xi-api-key": apiKey };
  if (env.CF_AIG_TOKEN) {
    headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
  }

  const res = await fetch(url, { method: "POST", headers, body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`elevenlabs ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== "string") throw new Error("elevenlabs: missing text");
  return json.text.trim();
}
