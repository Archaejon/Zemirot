/**
 * The desktop shell exposes the writing assistant through the preload bridge.
 * The API key itself never crosses that bridge; only requests and results do.
 */

export type AssistMode = "translation" | "context";
export type AssistProvider = "ollama" | "openai";

export interface AssistSettings {
  provider: AssistProvider;
  endpoint: string;
  ollamaUrl: string;
  model: string;
  /** Saved model name for each provider, so switching does not lose either. */
  models: Record<AssistProvider, string>;
  hasKey: boolean;
  /** A model is configured; this does not probe the local server. */
  ready: boolean;
  timeoutMs: number;
  contextLength: number;
  maxOutput: number;
  keepAlive: string;
}

export interface OllamaModel {
  name: string;
  parameterSize: string;
  quantization: string;
  size: number;
}

export interface OllamaStatus {
  available: boolean;
  baseUrl: string;
  version: string;
  models: OllamaModel[];
  model: string;
  modelInstalled: boolean;
}

export interface AssistProgress {
  characters: number;
}

export interface AssistStream {
  requestId: string;
  result: Promise<AssistRecord>;
  cancel: () => void;
}

export interface AssistRecord {
  songId: number;
  translation: string;
  description: string;
  supplement: string;
  model: string;
  provider?: AssistProvider;
  generatedAt: string;
  modes: AssistMode[];
  caveat: string;
}

export interface AssistApi {
  settings: () => Promise<AssistSettings>;
  saveSettings: (input: {
    provider?: AssistProvider;
    endpoint?: string;
    ollamaUrl?: string;
    model?: string;
    apiKey?: string;
    clearKey?: boolean;
    timeoutMs?: number;
    contextLength?: number;
    maxOutput?: number;
    keepAlive?: string;
  }) => Promise<AssistSettings>;
  checkOllama: (input?: { url?: string; model?: string }) => Promise<OllamaStatus>;
  get: (id: number) => Promise<AssistRecord | null>;
  generate: (song: unknown, modes: AssistMode[]) => Promise<AssistRecord>;
  generateStream: (
    song: unknown,
    modes: AssistMode[],
    onProgress?: (progress: AssistProgress) => void,
  ) => AssistStream;
}

export const ASSIST_CAVEAT =
  "Machine-generated draft. It can mistranslate piyyut, Aramaic, or kabbalistic allusions; check the source page before relying on it.";

/**
 * Electron prefixes rejected IPC calls with a technical sentence. The UI only
 * needs the useful part, and cancellation must be recognisable by its message.
 */
export function assistErrorMessage(reason: unknown, fallback = "The draft did not complete."): string {
  const raw = reason instanceof Error ? reason.message : String(reason ?? "");
  return (
    raw
      .replace(/^Error invoking remote method '[^']+':\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .trim() || fallback
  );
}

export function assistApi(): AssistApi | null {
  if (typeof window === "undefined") return null;
  return window.zemirot?.assist ?? null;
}

export function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}
