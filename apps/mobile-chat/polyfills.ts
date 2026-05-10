// Polyfills for Cloudflare Agents SDK + ws / partysocket.
// RN provides WebSocket but not the browser `Event` / `ErrorEvent` / `CloseEvent`
// / `MessageEvent` classes that `ws` subclasses. Ship minimal shims so the
// agent/useAgent hook can initialize.

import "react-native-url-polyfill/auto";
import {
  ReadableStream,
  WritableStream,
  TransformStream,
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
} from "web-streams-polyfill";

declare const global: typeof globalThis;
const g: any = global;

// Web Streams API — required by @cloudflare/ai-chat for SSE parsing.
if (typeof g.ReadableStream === "undefined") g.ReadableStream = ReadableStream;
if (typeof g.WritableStream === "undefined") g.WritableStream = WritableStream;
if (typeof g.TransformStream === "undefined") g.TransformStream = TransformStream;
if (typeof g.ByteLengthQueuingStrategy === "undefined")
  g.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
if (typeof g.CountQueuingStrategy === "undefined")
  g.CountQueuingStrategy = CountQueuingStrategy;

// Math.random-backed crypto shims — Hermes ships neither
// `crypto.getRandomValues` nor `crypto.randomUUID`. The agents SDK + nanoid
// rely on `getRandomValues` for request IDs (`nanoid(8)` tags every chat
// request inside `WebSocketChatTransport.sendMessages`); without it,
// sendMessages throws "undefined is not a function" before reaching
// `agent.send(...)` and no chat request ever leaves the device. Math.random
// is sufficient for request-id uniqueness — not for real cryptographic use,
// which would need `react-native-get-random-values` (native module).
if (typeof g.crypto === "undefined") {
  g.crypto = {};
}
if (typeof g.crypto.getRandomValues !== "function") {
  g.crypto.getRandomValues = function getRandomValues<T extends ArrayBufferView>(buf: T): T {
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return buf;
  };
}
if (typeof g.crypto.randomUUID !== "function") {
  g.crypto.randomUUID = function randomUUID(): string {
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC4122 variant
    const h = bytes.map(hex).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

if (typeof g.EventTarget === "undefined") {
  class EventTarget {
    private _listeners: Record<string, Set<Function>> = {};
    addEventListener(type: string, listener: Function) {
      (this._listeners[type] ??= new Set()).add(listener);
    }
    removeEventListener(type: string, listener: Function) {
      this._listeners[type]?.delete(listener);
    }
    dispatchEvent(event: { type: string }) {
      this._listeners[event.type]?.forEach((l) => {
        try {
          (l as any).call(this, event);
        } catch (e) {
          setTimeout(() => {
            throw e;
          }, 0);
        }
      });
      return true;
    }
  }
  g.EventTarget = EventTarget;
}

if (typeof g.Event === "undefined") {
  class Event {
    type: string;
    target: unknown = null;
    currentTarget: unknown = null;
    defaultPrevented = false;
    timeStamp = Date.now();
    constructor(type: string) {
      this.type = type;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopPropagation() {}
    stopImmediatePropagation() {}
  }
  g.Event = Event;
}

if (typeof g.ErrorEvent === "undefined") {
  class ErrorEvent extends g.Event {
    message: string;
    error: unknown;
    constructor(type: string, init: { message?: string; error?: unknown } = {}) {
      super(type);
      this.message = init.message ?? "";
      this.error = init.error ?? null;
    }
  }
  g.ErrorEvent = ErrorEvent;
}

if (typeof g.CloseEvent === "undefined") {
  class CloseEvent extends g.Event {
    code: number;
    reason: string;
    wasClean: boolean;
    constructor(
      type: string,
      init: { code?: number; reason?: string; wasClean?: boolean } = {}
    ) {
      super(type);
      this.code = init.code ?? 1000;
      this.reason = init.reason ?? "";
      this.wasClean = init.wasClean ?? true;
    }
  }
  g.CloseEvent = CloseEvent;
}

// Hermes (RN's default JS engine) doesn't ship `structuredClone`. The AI SDK's
// `Chat.state.snapshot = v => structuredClone(v)` runs on every `makeRequest`
// to deep-clone the user message before opening the agent stream — without
// this polyfill, `Chat.makeRequest` throws inside `try {}`, the inner
// `try { onFinish(...) } catch` then crashes on `this.activeResponse.state`
// (which was never assigned), and no `cf_agent_use_chat_request` is sent.
// JSON round-trip is sufficient because chat messages are always JSON-safe.
if (typeof g.structuredClone === "undefined") {
  g.structuredClone = function structuredClone(value: unknown) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  };
}

if (typeof g.MessageEvent === "undefined") {
  class MessageEvent extends g.Event {
    data: unknown;
    origin: string;
    lastEventId: string;
    constructor(
      type: string,
      init: { data?: unknown; origin?: string; lastEventId?: string } = {}
    ) {
      super(type);
      this.data = init.data;
      this.origin = init.origin ?? "";
      this.lastEventId = init.lastEventId ?? "";
    }
  }
  g.MessageEvent = MessageEvent;
}

export {};
