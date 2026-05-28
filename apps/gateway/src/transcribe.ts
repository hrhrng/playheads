/**
 * Speech-to-text endpoint — `POST /api/transcribe`.
 *
 * Config-driven: reads the active row from `asr_provider_config` (managed
 * in the admin "ASR" page), decrypts its API key, and dispatches through
 * the shared `@playheads/asr` runAsrProvider — the same code path the
 * admin smoke test uses, so test parity with production is guaranteed.
 *
 * Multipart in:
 *   - `audio` : File (webm/mp4/ogg/wav — whatever MediaRecorder emits)
 *   - `lang`  : BCP-47 hint from the client's i18n (e.g. "zh", "en"); the
 *               provider auto-detects when empty.
 *
 * JSON out: `{ text }` on 200, `{ error }` otherwise.
 */

import { runAsrProvider } from "@playheads/asr";

export interface TranscribeEnv {
  DB: D1Database;
  ADMIN_ENCRYPTION_KEY?: string;
  AI?: Ai;
  CF_AIG_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
}

interface AsrConfigRow {
  id: string;
  providerType: string;
  model: string;
  apiKey: string; // encrypted (empty for cf-workers-ai)
}

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
    return Response.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  // Resolve the active ASR provider.
  const row = await env.DB.prepare(
    "SELECT id, providerType, model, apiKey FROM asr_provider_config WHERE isActive = 1 LIMIT 1",
  ).first<AsrConfigRow>().catch(() => null);
  if (!row) {
    return Response.json(
      { error: "no active ASR provider configured" },
      { status: 503 },
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
    return Response.json({ error: `audio too large (max ${MAX_BYTES} bytes)` }, { status: 413 });
  }

  const lang = (form.get("lang") as string | null)?.trim() || "";
  const audio = new Uint8Array(await audioFile.arrayBuffer());
  const apiKey = row.apiKey ? await decryptKey(row.apiKey, env.ADMIN_ENCRYPTION_KEY) : "";

  try {
    const text = await runAsrProvider({
      providerType: row.providerType,
      model: row.model,
      apiKey: apiKey || undefined,
      audio,
      mime: audioFile.type || "audio/webm",
      filename: audioFile.name || "recording.webm",
      lang,
      env,
    });
    return Response.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[transcribe] error", { provider: row.providerType, msg });
    return Response.json({ error: msg }, { status: 502 });
  }
}

// AES-256-GCM decrypt — mirrors the admin encrypt() format
// (12-byte IV prepended, base64). Returns the input unchanged if no key
// is configured (matches admin's no-op behavior in dev).
async function decryptKey(encoded: string, hexKey?: string): Promise<string> {
  if (!hexKey || hexKey.length < 64) return encoded;
  try {
    const raw = new Uint8Array(hexKey.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
    const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
    return new TextDecoder().decode(pt);
  } catch {
    return encoded;
  }
}
