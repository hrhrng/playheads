/**
 * Speech-to-text endpoint — `POST /api/transcribe`.
 *
 * Multipart in:
 *   - `audio`  : File (webm/mp4/ogg/wav — whatever MediaRecorder emits)
 *   - `lang`   : BCP-47 language tag from the client's current i18n
 *                (e.g. "zh", "zh-CN", "en", "ja"). Used both to route the
 *                provider and as a hint to the provider.
 *
 * JSON out:    `{ text: string }`  on 200
 *              `{ error: string }` on 4xx/5xx
 *
 * Provider router:
 *   - `lang.startsWith("zh")`  → Fish Audio /v1/asr      (sync, msgpack)
 *   - everything else          → ElevenLabs Scribe v1 via Cloudflare
 *                                AI Gateway (gateway "clash")
 *
 * The Chinese branch deliberately bypasses AI Gateway — neither Fish nor
 * Volcengine is in the supported-provider list, and the Universal Endpoint
 * is deprecated. The non-Chinese branch goes through the gateway so we get
 * the same observability/caching/rate-limit dashboard as the LLM calls.
 */

import { encode as encodeMsgpack } from "@msgpack/msgpack";

export interface TranscribeEnv {
  FISH_AUDIO_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  CF_AIG_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
}

/** Hard cap so a runaway recorder can't hammer the provider. ~3 min of
 *  16-bit 16kHz mono PCM = ~5.7 MB; opus/webm at typical bitrate is much
 *  smaller, so this is comfortably above the largest chat utterance. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function handleTranscribe(
  request: Request,
  env: TranscribeEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return Response.json(
      { error: "multipart/form-data required" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid multipart body" }, { status: 400 });
  }

  const entry = form.get("audio");
  if (
    !entry ||
    typeof entry === "string" ||
    typeof (entry as { type?: unknown }).type !== "string" ||
    typeof (entry as { size?: unknown }).size !== "number" ||
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

  if (audioFile.size === 0) {
    return Response.json({ error: "empty audio" }, { status: 400 });
  }
  if (audioFile.size > MAX_BYTES) {
    return Response.json(
      { error: `audio too large (max ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  const rawLang = (form.get("lang") as string | null)?.trim() || "en";
  const lang = rawLang.toLowerCase();

  const audioBuf = new Uint8Array(await audioFile.arrayBuffer());

  try {
    if (lang.startsWith("zh")) {
      const text = await transcribeWithFish(audioBuf, env);
      return Response.json({ text });
    }
    const text = await transcribeWithElevenLabs(
      audioBuf,
      audioFile.type || "audio/webm",
      audioFile.name || "recording.webm",
      lang,
      env,
    );
    return Response.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[transcribe] error", { lang, msg });
    return Response.json({ error: msg }, { status: 502 });
  }
}

// ── Fish Audio /v1/asr (Chinese) ───────────────────────────────
//
// Docs: https://docs.fish.audio  (msgpack body, sync JSON response).
// Payload shape mirrors the official Python SDK:
//   { audio: <bytes>, language: "zh", ignore_timestamps: true }
async function transcribeWithFish(
  audio: Uint8Array,
  env: TranscribeEnv,
): Promise<string> {
  if (!env.FISH_AUDIO_API_KEY) {
    throw new Error("FISH_AUDIO_API_KEY not configured");
  }

  const body = encodeMsgpack({
    audio,
    language: "zh",
    ignore_timestamps: true,
  });

  const res = await fetch("https://api.fish.audio/v1/asr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`,
      "Content-Type": "application/msgpack",
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`fish ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== "string") {
    throw new Error("fish: missing text in response");
  }
  return json.text.trim();
}

// ── ElevenLabs Scribe v1 via Cloudflare AI Gateway (non-Chinese) ────
//
// AI Gateway proxy route:
//   https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/elevenlabs/v1/speech-to-text
//
// Auth carries two tokens:
//   - `Authorization: Bearer <ELEVENLABS_API_KEY>`  (origin)
//   - `cf-aig-authorization: Bearer <CF_AIG_TOKEN>` (gateway)
//
// Body is multipart with `file` + `model_id=scribe_v1`. Optional `language_code`
// is a hint — Scribe will still language-detect, but passing it improves
// short-utterance accuracy.
async function transcribeWithElevenLabs(
  audio: Uint8Array,
  mime: string,
  filename: string,
  lang: string,
  env: TranscribeEnv,
): Promise<string> {
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.AI_GATEWAY_ID) {
    throw new Error("AI Gateway not configured");
  }

  const url =
    `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/` +
    `${env.AI_GATEWAY_ID}/elevenlabs/v1/speech-to-text`;

  const fd = new FormData();
  // BCP-47 → ISO 639-1 (Scribe takes the 2-letter code; "zh-CN" → "zh",
  // "en-US" → "en"). Anything we can't reduce, we just drop and let the
  // model auto-detect.
  const langCode = lang.split("-")[0];
  if (/^[a-z]{2}$/.test(langCode)) {
    fd.set("language_code", langCode);
  }
  fd.set("model_id", "scribe_v1");
  // Blob constructor handles the Uint8Array as the payload; explicit type
  // keeps the multipart filename + content-type honest.
  fd.set("file", new Blob([audio], { type: mime }), filename);

  const headers: Record<string, string> = {
    "xi-api-key": env.ELEVENLABS_API_KEY,
  };
  if (env.CF_AIG_TOKEN) {
    headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
  }

  const res = await fetch(url, { method: "POST", headers, body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`elevenlabs ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== "string") {
    throw new Error("elevenlabs: missing text in response");
  }
  return json.text.trim();
}
