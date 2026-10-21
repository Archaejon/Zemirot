import { useEffect, useRef, useState } from "react";
import {
  assistApi,
  assistErrorMessage,
  type AssistMode,
  type AssistProvider,
  type AssistSettings,
  type AssistStream,
  type OllamaStatus,
} from "../lib/assist";
import { isCustomId, songDataPath } from "../lib/edition";
import { joinClassNames } from "../lib/format";
import type { LibrarySong, SongDetail } from "../lib/types";
import { ExternalIcon } from "./Icons";

const TIMEOUT_OPTIONS = [
  { value: 60_000, label: "1 minute" },
  { value: 120_000, label: "2 minutes" },
  { value: 180_000, label: "3 minutes" },
  { value: 300_000, label: "5 minutes" },
  { value: 600_000, label: "10 minutes" },
];

const CONTEXT_OPTIONS = [
  { value: 4096, label: "4K — short songs" },
  { value: 8192, label: "8K — recommended" },
  { value: 16_384, label: "16K — long piyyutim" },
  { value: 32_768, label: "32K — high memory" },
];

const OUTPUT_OPTIONS = [
  { value: 1024, label: "1K tokens" },
  { value: 2048, label: "2K tokens" },
  { value: 4096, label: "4K tokens — recommended" },
  { value: 8192, label: "8K tokens" },
];

const KEEP_ALIVE_OPTIONS = [
  { value: "0", label: "Unload after each draft" },
  { value: "5m", label: "Keep for 5 minutes" },
  { value: "30m", label: "Keep for 30 minutes" },
  { value: "1h", label: "Keep for 1 hour" },
];

function modelTag(name: string): string {
  return name.includes(":") ? name : `${name}:latest`;
}

function formatModelSize(bytes: number): string {
  if (!bytes) return "";
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function WritingAssistant({ songs }: { songs: LibrarySong[] }) {
  const api = assistApi();
  const [settings, setSettings] = useState<AssistSettings | null>(null);
  const [provider, setProvider] = useState<AssistProvider>("ollama");
  const [endpoint, setEndpoint] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(180_000);
  const [contextLength, setContextLength] = useState(8192);
  const [maxOutput, setMaxOutput] = useState(4096);
  const [keepAlive, setKeepAlive] = useState("5m");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkStatus, setCheckStatus] = useState<OllamaStatus | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ mode: AssistMode; done: number; total: number } | null>(
    null,
  );
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const stopBatch = useRef(false);
  const batchCurrent = useRef<AssistStream | null>(null);
  const batchLock = useRef(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    api
      .settings()
      .then((value) => {
        if (!active) return;
        setSettings(value);
        setProvider(value.provider);
        setEndpoint(value.endpoint);
        setOllamaUrl(value.ollamaUrl);
        setModel(value.model);
        setTimeoutMs(value.timeoutMs);
        setContextLength(value.contextLength);
        setMaxOutput(value.maxOutput);
        setKeepAlive(value.keepAlive);
      })
      .catch((reason: unknown) => {
        if (active) setError(assistErrorMessage(reason, "Settings could not be read."));
      });
    return () => {
      active = false;
    };
  }, [api]);

  const save = async (clearKey = false) => {
    if (!api || busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const next = await api.saveSettings({
        provider,
        endpoint,
        ollamaUrl,
        model,
        apiKey: clearKey ? undefined : apiKey,
        clearKey,
        timeoutMs,
        contextLength,
        maxOutput,
        keepAlive,
      });
      setSettings(next);
      setProvider(next.provider);
      setEndpoint(next.endpoint);
      setOllamaUrl(next.ollamaUrl);
      setModel(next.model);
      setTimeoutMs(next.timeoutMs);
      setContextLength(next.contextLength);
      setMaxOutput(next.maxOutput);
      setKeepAlive(next.keepAlive);
      setApiKey("");
      // A saved address or model invalidates an earlier check result.
      setCheckError(null);
      if (checkStatus && checkStatus.baseUrl !== next.ollamaUrl) setCheckStatus(null);
      setStatus(clearKey ? "Key removed." : "Settings saved.");
    } catch (reason) {
      setError(assistErrorMessage(reason, "The settings could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const switchProvider = (next: AssistProvider) => {
    if (next === provider) return;
    setProvider(next);
    setModel(settings?.models[next] ?? "");
    setCheckStatus(null);
    setCheckError(null);
    setStatus(null);
    setError(null);
  };

  const checkOllama = async () => {
    if (!api || checking) return;
    setChecking(true);
    setCheckError(null);
    setCheckStatus(null);
    try {
      const result = await api.checkOllama({ url: ollamaUrl, model });
      setCheckStatus(result);
      if (!model && result.models[0]) setModel(result.models[0].name);
      if (result.models.length === 0) {
        setCheckError("Ollama is running, but no models are installed. Pull one in a terminal first.");
      } else if (result.model && !result.modelInstalled) {
        const first = result.models[0]?.name;
        setCheckError(
          `The selected model is not installed. Run "ollama pull ${result.model}"${
            first ? `, or choose ${first} below.` : "."
          }`,
        );
      }
    } catch (reason) {
      setCheckError(assistErrorMessage(reason, "Ollama could not be reached."));
    } finally {
      setChecking(false);
    }
  };

  const findMissing = async (mode: AssistMode): Promise<SongDetail[]> => {
    if (!api) return [];
    const candidates = songs.filter((song) => !isCustomId(song.id));
    const missing: SongDetail[] = [];
    for (const song of candidates) {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}${songDataPath(song.id)}`,
        );
        if (!response.ok) continue;
        const detail = (await response.json()) as SongDetail;
        const record = await api.get(detail.id).catch(() => null);
        if (mode === "translation" && !detail.translation.trim() && !record?.translation) {
          missing.push(detail);
        }
        if (mode === "context" && !detail.information.trim() && !record?.description) {
          missing.push(detail);
        }
      } catch {
        // A missing or malformed record should not stop the scan.
      }
    }
    return missing;
  };

  const runBatch = async (mode: AssistMode) => {
    if (!api || !settings?.ready || batchLock.current) return;
    batchLock.current = true;
    setBatchStatus(
      mode === "translation"
        ? "Scanning for songs without a translation…"
        : "Scanning for songs without a description…",
    );
    const missing = await findMissing(mode);
    if (missing.length === 0) {
      setBatchStatus(
        mode === "translation"
          ? "Every song already has a translation or a draft."
          : "Every song already has a description or a draft.",
      );
      batchLock.current = false;
      return;
    }

    // Local inference is deliberately capped. A full-library batch on a single
    // local model can occupy a computer for hours; readers can run another
    // small batch when they choose.
    const limit = settings.provider === "ollama" ? 8 : 25;
    const queue = missing.slice(0, limit);
    const noun = mode === "translation" ? "translations" : "descriptions";
    const local = settings.provider === "ollama";
    let providerLabel = "your provider";
    if (local) {
      providerLabel = `Ollama at ${settings.ollamaUrl}`;
    } else {
      try {
        providerLabel = new URL(settings.endpoint).host;
      } catch {
        // Keep the generic label if the endpoint is malformed.
      }
    }
    const confirmed = window.confirm(
      `Draft ${queue.length} ${noun} with ${settings.model}?\n\n${
        local
          ? `Each song is one generation through ${providerLabel}. It can take minutes and use CPU or GPU. The model stays loaded according to the retention setting.`
          : `Each song is one request to ${providerLabel} and is billed by that provider. The song text leaves this computer.`
      } You can stop the batch at any point.`,
    );
    if (!confirmed) {
      setBatchStatus("Batch cancelled.");
      batchLock.current = false;
      return;
    }

    stopBatch.current = false;
    setBatch({ mode, done: 0, total: queue.length });
    setBatchStatus(null);
    let done = 0;
    let failed = 0;
    for (const song of queue) {
      if (stopBatch.current) break;
      const stream = api.generateStream(song, [mode]);
      batchCurrent.current = stream;
      try {
        await stream.result;
      } catch (reason) {
        if (assistErrorMessage(reason) === "Draft cancelled.") {
          stopBatch.current = true;
        } else {
          failed += 1;
        }
      } finally {
        if (batchCurrent.current === stream) batchCurrent.current = null;
      }
      if (stopBatch.current) break;
      done += 1;
      setBatch({ mode, done, total: queue.length });
    }
    setBatch(null);
    batchLock.current = false;
    const remaining = missing.length - done;
    setBatchStatus(
      `${done - failed} ${noun} drafted${failed > 0 ? `; ${failed} failed` : ""}${
        stopBatch.current ? " (stopped early)" : ""
      }${remaining > 0 ? `; ${remaining} more still need one` : ""}. Open a song to read its draft.`,
    );
  };

  const installedModels = checkStatus?.models ?? [];
  const selectedInstalled = installedModels.some(
    (item) => modelTag(item.name) === modelTag(model),
  );
  const statusLabel =
    settings?.provider === "ollama"
      ? settings.ready
        ? "Local · configured"
        : "Local · not set"
      : settings?.ready
        ? "Ready"
        : "Not configured";

  return (
    <section>
      <h2>Writing assistant</h2>
      <div className="assist-settings panel">
        <div className="update-panel-head">
          <div>
            <p className="eyebrow">Optional · machine drafts</p>
            <h3>Draft translations and context</h3>
          </div>
          <span className="update-version">{statusLabel}</span>
        </div>

        {api ? (
          <form
            className="assist-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save(false);
            }}
          >
            <p>
              {provider === "ollama"
                ? "Draft missing English translations and context notes with a model running on this computer through Ollama. The text stays on this machine, and the model is only loaded when you ask for a draft."
                : "Draft missing English translations and context notes with an OpenAI-compatible provider. The song text leaves this computer for the endpoint you configure; nothing passes through a Zemirot Studio server."}
            </p>

            <div className="assist-provider" role="group" aria-label="Drafting provider">
              <button
                type="button"
                className={joinClassNames(
                  "assist-provider-option",
                  provider === "ollama" && "is-active",
                )}
                aria-pressed={provider === "ollama"}
                onClick={() => switchProvider("ollama")}
              >
                Local · Ollama
              </button>
              <button
                type="button"
                className={joinClassNames(
                  "assist-provider-option",
                  provider === "openai" && "is-active",
                )}
                aria-pressed={provider === "openai"}
                onClick={() => switchProvider("openai")}
              >
                External API
              </button>
            </div>

            <div className="assist-fields">
              {provider === "ollama" ? (
                <>
                  <label className="assist-field">
                    <span>Ollama address</span>
                    <input
                      type="url"
                      value={ollamaUrl}
                      onChange={(event) => {
                        setOllamaUrl(event.target.value);
                        setCheckStatus(null);
                        setCheckError(null);
                      }}
                      placeholder="http://127.0.0.1:11434"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  <label className="assist-field">
                    <span>Model</span>
                    <input
                      type="text"
                      value={model}
                      onChange={(event) => {
                        setModel(event.target.value);
                        setCheckError(null);
                      }}
                      placeholder="gemma3:4b"
                      list="ollama-model-options"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <datalist id="ollama-model-options">
                      {installedModels.map((item) => (
                        <option key={item.name} value={item.name} />
                      ))}
                    </datalist>
                  </label>
                </>
              ) : (
                <>
                  <label className="assist-field">
                    <span>Endpoint</span>
                    <input
                      type="url"
                      value={endpoint}
                      onChange={(event) => setEndpoint(event.target.value)}
                      placeholder="https://openrouter.ai/api/v1"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  <label className="assist-field">
                    <span>Model</span>
                    <input
                      type="text"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder="google/gemini-3.5-flash"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  <label className="assist-field assist-field--wide">
                    <span>
                      API key{" "}
                      {settings?.hasKey ? "(saved — enter a new key to replace)" : ""}
                    </span>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={settings?.hasKey ? "••••••••••••" : "Paste the provider key"}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                </>
              )}
            </div>

            {provider === "ollama" && (
              <div className="assist-settings-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => void checkOllama()}
                  disabled={checking}
                >
                  {checking ? "Checking Ollama…" : "Check connection"}
                </button>
                <a
                  className="button button--quiet"
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get Ollama <ExternalIcon width={13} height={13} />
                </a>
                <span className="assist-caveat">
                  Models are never downloaded by this app.
                </span>
              </div>
            )}

            {provider === "ollama" && checkStatus && (
              <div className="assist-ollama-status">
                <p>
                  Ollama {checkStatus.version || "is running"} ·{" "}
                  {installedModels.length}{" "}
                  {installedModels.length === 1 ? "model" : "models"} installed
                  {selectedInstalled ? ` · ${model} is ready` : ""}.
                </p>
                {installedModels.length > 0 && (
                  <div className="assist-model-list" aria-label="Installed Ollama models">
                    {installedModels.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        className={joinClassNames(
                          "assist-model",
                          modelTag(item.name) === modelTag(model) && "is-active",
                        )}
                        aria-pressed={modelTag(item.name) === modelTag(model)}
                        onClick={() => {
                          setModel(item.name);
                          setCheckError(null);
                        }}
                      >
                        <span>{item.name}</span>
                        <small>
                          {[item.parameterSize, item.quantization, formatModelSize(item.size)]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <details className="assist-advanced">
              <summary>Resource settings</summary>
              <p>
                Small context and output limits keep memory use predictable. A
                loaded model stays in memory for the retention period after a
                draft; choosing <em>Unload after each draft</em> frees it
                immediately.
              </p>
              <div className="assist-fields assist-fields--three">
                <label className="assist-field">
                  <span>Timeout</span>
                  <select
                    value={timeoutMs}
                    onChange={(event) => setTimeoutMs(Number(event.target.value))}
                  >
                    {TIMEOUT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="assist-field">
                  <span>Context</span>
                  <select
                    value={contextLength}
                    onChange={(event) => setContextLength(Number(event.target.value))}
                  >
                    {CONTEXT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="assist-field">
                  <span>Maximum output</span>
                  <select
                    value={maxOutput}
                    onChange={(event) => setMaxOutput(Number(event.target.value))}
                  >
                    {OUTPUT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {provider === "ollama" && (
                  <label className="assist-field">
                    <span>Model retention</span>
                    <select
                      value={keepAlive}
                      onChange={(event) => setKeepAlive(event.target.value)}
                    >
                      {KEEP_ALIVE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </details>

            <div className="assist-settings-actions">
              <button type="submit" className="button button--primary" disabled={busy}>
                {busy ? "Saving…" : "Save settings"}
              </button>
              {provider === "openai" && settings?.hasKey && (
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => void save(true)}
                  disabled={busy}
                >
                  Remove key
                </button>
              )}
              {provider === "openai" && (
                <a
                  className="button"
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get an OpenRouter key <ExternalIcon width={13} height={13} />
                </a>
              )}
            </div>

            <p
              className={joinClassNames("update-status", error && "is-error")}
              role="status"
              aria-live="polite"
            >
              {error ??
                checkError ??
                status ??
                (settings?.ready
                  ? `Configured · ${settings.provider === "ollama" ? "Local" : "External"} · ${settings.model}`
                  : provider === "ollama"
                    ? "Choose an installed Ollama model, then save."
                    : "No key saved yet.")}
            </p>

            <p className="fine-print">
              {provider === "ollama"
                ? "Inference stays on this computer through Ollama. The app does not check the server at launch, poll it, or download models. Nothing is sent to an external AI provider."
                : "The key is encrypted with your operating system's credential store and stays on this computer. Drafts cost whatever your provider charges."}
            </p>

            <div className="assist-batch">
              <p className="eyebrow">Batch drafts</p>
              <p>
                Fill gaps across the library. The scan is local; only songs that
                still need a draft are sent, one request at a time. Local runs are
                capped at eight songs per batch so a single action cannot occupy
                the computer for hours.
              </p>
              <div className="assist-settings-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => void runBatch("translation")}
                  disabled={!settings?.ready || batch !== null}
                >
                  Draft missing translations
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => void runBatch("context")}
                  disabled={!settings?.ready || batch !== null}
                >
                  Draft missing descriptions
                </button>
                {batch && (
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => {
                      stopBatch.current = true;
                      batchCurrent.current?.cancel();
                    }}
                  >
                    Stop
                  </button>
                )}
              </div>
              {batch ? (
                <p className="update-status" role="status" aria-live="polite">
                  Drafting {batch.done + 1} of {batch.total}{" "}
                  {batch.mode === "translation" ? "translations" : "descriptions"}…
                </p>
              ) : (
                batchStatus && (
                  <p className="update-status" role="status" aria-live="polite">
                    {batchStatus}
                  </p>
                )
              )}
            </div>
          </form>
        ) : (
          <p>
            The writing assistant runs in the installed desktop app. Local
            inference uses Ollama on the same computer; the browser edition does
            not call an inference service or expose a public AI endpoint.
          </p>
        )}
      </div>
    </section>
  );
}
