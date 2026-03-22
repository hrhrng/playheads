/**
 * Lightweight structured logger for request-level tracing.
 *
 * Generates a traceId per request and provides span-based timing.
 * All output goes to console.log as JSON lines — Cloudflare Workers
 * observability picks these up automatically.
 */

export interface Span {
  readonly name: string;
  /** Log an intermediate event within this span. */
  info(data?: Record<string, unknown>): void;
  /** Log a warning within this span. */
  warn(data?: Record<string, unknown>): void;
  /** End the span, automatically computing elapsedMs from creation. */
  end(data?: Record<string, unknown>): void;
}

export interface Logger {
  readonly traceId: string;
  /** Log a point-in-time event (no duration). */
  info(event: string, data?: Record<string, unknown>): void;
  /** Log a warning event. */
  warn(event: string, data?: Record<string, unknown>): void;
  /** Log an error event. */
  error(event: string, data?: Record<string, unknown>): void;
  /** Create a named span that tracks elapsed time until .end() is called. */
  span(name: string): Span;
}

/** Generate a short trace ID (8 hex chars) for compact log lines. */
function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function emit(
  level: "info" | "warn" | "error",
  traceId: string,
  event: string,
  data?: Record<string, unknown>,
  elapsedMs?: number
): void {
  const entry: Record<string, unknown> = {
    traceId,
    event,
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...data,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export function createLogger(): Logger {
  const traceId = shortId();

  return {
    traceId,

    info(event, data) {
      emit("info", traceId, event, data);
    },

    warn(event, data) {
      emit("warn", traceId, event, data);
    },

    error(event, data) {
      emit("error", traceId, event, data);
    },

    span(name) {
      const start = Date.now();
      emit("info", traceId, name, { phase: "start" });

      return {
        name,
        info(data) {
          emit("info", traceId, name, data, Date.now() - start);
        },
        warn(data) {
          emit("warn", traceId, name, data, Date.now() - start);
        },
        end(data) {
          emit("info", traceId, name, { phase: "end", ...data }, Date.now() - start);
        },
      };
    },
  };
}
