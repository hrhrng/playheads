/**
 * Image upload handlers — multipart POST in, R2 PUT, gateway-proxied GET.
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_PREFIX = "image/";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
};

function todayDir(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function handleUploadImage(request: Request, bucket: R2Bucket): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid multipart body" }, { status: 400 });
  }

  const entry = form.get("file");
  // FormData entries are string | File. Duck-type for File (has .type, .size, .stream).
  if (
    !entry ||
    typeof entry === "string" ||
    typeof (entry as { type?: unknown }).type !== "string" ||
    typeof (entry as { size?: unknown }).size !== "number" ||
    typeof (entry as { stream?: unknown }).stream !== "function"
  ) {
    return Response.json({ error: "file field required" }, { status: 400 });
  }
  const file = entry as unknown as {
    type: string;
    size: number;
    stream: () => ReadableStream;
  };

  if (!file.type.startsWith(ALLOWED_PREFIX)) {
    return Response.json({ error: `unsupported type: ${file.type}` }, { status: 415 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json({ error: `file too large (max ${MAX_BYTES} bytes)` }, { status: 413 });
  }

  const ext = EXT_BY_MIME[file.type] || "bin";
  const id = crypto.randomUUID();
  const key = `uploads/${todayDir()}/${id}.${ext}`;

  await bucket.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return Response.json({
    key,
    url: `/api/uploads/${key}`,
    contentType: file.type,
    size: file.size,
  });
}

export async function handleGetUpload(request: Request, bucket: R2Bucket, key: string): Promise<Response> {
  // Strict: key must start with "uploads/" and only contain safe chars.
  if (!/^uploads\/[\w-]+\/[\w.-]+$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  const obj = await bucket.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }

  return new Response(obj.body, { headers });
}
