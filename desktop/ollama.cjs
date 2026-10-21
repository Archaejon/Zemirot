/**
 * Central Ollama client for the desktop process.
 *
 * This module owns every HTTP call to Ollama: connection checks and chat.
 * It has no Electron or UI dependencies, never downloads a model, and only
 * accepts loopback URLs so song text cannot be sent to a public endpoint by
 * accident. The renderer never talks to Ollama directly.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function normalizeBaseUrl(value) {
  const raw = String(value ?? "").trim() || DEFAULT_BASE_URL;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("The Ollama address must be a full http URL, such as http://127.0.0.1:11434.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The Ollama address must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("The Ollama address must not contain a username or password.");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "Local AI is limited to Ollama on this computer (localhost or 127.0.0.1).",
    );
  }
  if (parsed.search || parsed.hash) {
    throw new Error("The Ollama address must not include a query string or fragment.");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

function friendlyConnectionError(baseUrl) {
  return `Ollama is not reachable at ${baseUrl}. Start Ollama, then try again.`;
}

function readErrorDetail(text) {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed?.error === "string" ? parsed.error : "";
  } catch {
    return String(text ?? "").slice(0, 300);
  }
}

function httpError(status, text, model) {
  const detail = readErrorDetail(text);
  if (model && status === 404 && /not found|try pulling/i.test(detail)) {
    return new Error(
      `The model "${model}" is not installed. Run "ollama pull ${model}" in a terminal; Zemirot Studio will not download it.`,
    );
  }
  if (status === 429) {
    return new Error("Ollama is busy with another request. Wait a moment and try again.");
  }
  return new Error(
    `Ollama returned HTTP ${status}${detail ? `: ${detail}` : "."}`,
  );
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!response.ok) throw httpError(response.status, text, "");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Ollama returned a malformed response.");
  }
}

/**
 * Check the local server and list installed models. This is only called from
 * the explicit "Check connection" action; the app never probes Ollama at
 * startup or on a timer.
 */
async function check(value, { timeoutMs = 5000 } = {}) {
  const baseUrl = normalizeBaseUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const [versionResponse, tagsResponse] = await Promise.all([
      fetch(`${baseUrl}/api/version`, { signal: controller.signal }),
      fetch(`${baseUrl}/api/tags`, { signal: controller.signal }),
    ]);
    const version = await readJsonResponse(versionResponse);
    const tags = await readJsonResponse(tagsResponse);
    const models = Array.isArray(tags?.models)
      ? tags.models
          .filter((model) => typeof model?.name === "string")
          .map((model) => ({
            name: model.name,
            parameterSize:
              typeof model.details?.parameter_size === "string"
                ? model.details.parameter_size
                : "",
            quantization:
              typeof model.details?.quantization_level === "string"
                ? model.details.quantization_level
                : "",
            size: Number(model.size) || 0,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    return {
      available: true,
      baseUrl,
      version: typeof version?.version === "string" ? version.version : "",
      models,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Ollama did not answer within ${Math.round(timeoutMs / 1000)} seconds at ${baseUrl}.`);
    }
    if (error instanceof Error && /HTTP \d+|malformed|Ollama is busy/.test(error.message)) {
      throw error;
    }
    throw new Error(friendlyConnectionError(baseUrl));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stream a chat completion from Ollama. Resolves with the complete text after
 * the final NDJSON chunk; the caller validates it as untrusted model output.
 */
async function chat({
  baseUrl,
  model,
  messages,
  format,
  options,
  keepAlive,
  timeoutMs,
  signal,
  onToken,
}) {
  const base = normalizeBaseUrl(baseUrl);
  const controller = new AbortController();
  let abortReason = "";
  let timer = null;

  const cancel = () => {
    abortReason = "cancelled";
    controller.abort();
  };
  if (signal) {
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  }
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      abortReason = "timeout";
      controller.abort();
    }, timeoutMs);
  }

  try {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        format,
        options,
        keep_alive: keepAlive === "0" ? 0 : keepAlive,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw httpError(response.status, await response.text(), model);
    }
    if (!response.body) throw new Error("Ollama returned an empty response.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let done = false;
    let stats = {};

    const handleLine = (line) => {
      if (!line.trim()) return;
      let chunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        throw new Error("Ollama sent a malformed streaming response.");
      }
      if (typeof chunk?.error === "string" && chunk.error) {
        throw new Error(`Ollama: ${chunk.error}`);
      }
      if (typeof chunk?.message?.content === "string" && chunk.message.content) {
        content += chunk.message.content;
        if (onToken) onToken(content);
      }
      if (chunk?.done === true) {
        done = true;
        stats = {
          totalDuration: Number(chunk.total_duration) || 0,
          loadDuration: Number(chunk.load_duration) || 0,
          evalCount: Number(chunk.eval_count) || 0,
        };
      }
    };

    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    handleLine(buffer);

    if (!done && !content.trim()) {
      throw new Error("Ollama closed the response without producing text.");
    }
    if (!content.trim()) throw new Error("Ollama returned no text.");
    return { content, model, ...stats };
  } catch (error) {
    if (controller.signal.aborted) {
      if (abortReason === "timeout") {
        throw new Error(
          `The draft timed out after ${Math.round(timeoutMs / 1000)} seconds. The model may still be loading; try again or raise the timeout in About.`,
        );
      }
      throw new Error("Draft cancelled.");
    }
    if (
      error instanceof Error &&
      /HTTP \d+|Ollama:|is not installed|Ollama is busy|malformed|returned no text|empty response/.test(
        error.message,
      )
    ) {
      throw error;
    }
    throw new Error(friendlyConnectionError(base));
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", cancel);
  }
}

module.exports = {
  DEFAULT_BASE_URL,
  chat,
  check,
  normalizeBaseUrl,
};
