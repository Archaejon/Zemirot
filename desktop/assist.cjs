/**
 * Local-first writing assistant for Zemirot Studio.
 *
 * The desktop main process owns provider access. Ollama is the default and
 * runs entirely on this computer; an OpenAI-compatible endpoint remains
 * available for readers who already configured one. The renderer never sees an
 * API key and never talks to either provider directly.
 *
 * Only explicit draft actions reach a model. There is no startup probe, timer,
 * automatic retry, or model download. Final model output is validated before
 * it is stored, and every stored result remains a labelled machine draft.
 */
const { safeStorage } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ollama = require("./ollama.cjs");

const DEFAULT_PROVIDER = "ollama";
const DEFAULT_OLLAMA_URL = ollama.DEFAULT_BASE_URL;
// A compact multilingual model is a useful starting point, but the reader can
// choose anything installed locally. The app never pulls a model for them.
const DEFAULT_OLLAMA_MODEL = "gemma3:4b";
const DEFAULT_OPENAI_ENDPOINT = "https://openrouter.ai/api/v1";
const DEFAULT_OPENAI_MODEL = "google/gemini-3.5-flash";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_CONTEXT_LENGTH = 8192;
const DEFAULT_MAX_OUTPUT = 4096;
const DEFAULT_KEEP_ALIVE = "5m";

const SETTINGS_FILE = "assist-settings.json";
const CAVEAT =
  "Machine-generated draft. It can mistranslate piyyut, Aramaic, or kabbalistic allusions; check the source page before relying on it.";

const SYSTEM_PROMPT = `You are a careful translator and annotator of Jewish liturgical poetry: piyyutim, zemirot, Baqashot, and table songs. You write for a quiet reading app, not for a scholarly edition.

Rules:
- Translate faithfully into clear modern English. Preserve line breaks and stanza breaks, and keep acrostics and repeated refrains visible.
- Do not add explanations inside the translation. Render the Tetragrammaton as "HaShem"; keep names of people and places recognizable.
- The text may be Hebrew, Aramaic, or Yiddish. Translate from the language actually used. Do not pretend an Aramaic or Yiddish text is Hebrew.
- In descriptions and notes, use only the supplied metadata and what is evident in the text. Do not invent an author, date, occasion, melody, or halachic claim. If something is uncertain, say so plainly.
- The app labels every result as a machine draft. Accuracy and honesty matter more than fluency.
Return only a JSON object with exactly the keys "translation", "description", and "supplement". Use an empty string for a field that was not requested.`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    translation: { type: "string" },
    description: { type: "string" },
    supplement: { type: "string" },
  },
  required: ["translation", "description", "supplement"],
  additionalProperties: false,
};

function settingsPath(userData) {
  return path.join(userData, SETTINGS_FILE);
}

function recordPath(userData, id) {
  return path.join(userData, "assist", `${id}.json`);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.promises.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.promises.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fs.promises.rm(file, { force: true });
  await fs.promises.rename(temporary, file);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeKeepAlive(value) {
  const raw = String(value ?? "").trim();
  if (raw === "0") return "0";
  if (/^\d{1,4}(s|m|h)$/.test(raw)) return raw;
  return DEFAULT_KEEP_ALIVE;
}

function normalizeProvider(value, fallback) {
  return value === "ollama" || value === "openai" ? value : fallback;
}

function normalizeEndpoint(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return DEFAULT_OPENAI_ENDPOINT;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("The endpoint must be a full http(s) URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("The endpoint must use http or https.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol === "http:" && !loopback) {
    throw new Error("Use https for a remote endpoint, so the API key is not sent in clear text.");
  }
  return raw.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
}

function chatEndpoint(base) {
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

function normalizeModel(value, fallback) {
  const model = String(value ?? "").trim();
  if (!model) return fallback;
  if (model.length > 200) throw new Error("That model name is too long.");
  return model;
}

function modelTag(name) {
  return name.includes(":") ? name : `${name}:latest`;
}

function readSafeOllamaUrl(saved) {
  try {
    return ollama.normalizeBaseUrl(saved?.ollamaUrl);
  } catch {
    return DEFAULT_OLLAMA_URL;
  }
}

function readSafeEndpoint(saved) {
  try {
    return normalizeEndpoint(saved?.endpoint);
  } catch {
    return DEFAULT_OPENAI_ENDPOINT;
  }
}

async function readSettingsFile(userData) {
  const saved = await readJson(settingsPath(userData), null);
  // Files written before local AI existed have no provider. Those were
  // external-provider configurations, so preserve that behaviour.
  const provider = normalizeProvider(
    saved?.provider,
    saved ? "openai" : DEFAULT_PROVIDER,
  );
  const savedModel = text(saved?.model);
  return {
    provider,
    endpoint: readSafeEndpoint(saved),
    ollamaUrl: readSafeOllamaUrl(saved),
    ollamaModel: text(
      saved?.ollamaModel,
      provider === "ollama" ? savedModel || DEFAULT_OLLAMA_MODEL : DEFAULT_OLLAMA_MODEL,
    ),
    openaiModel: text(
      saved?.openaiModel,
      provider === "openai" ? savedModel || DEFAULT_OPENAI_MODEL : DEFAULT_OPENAI_MODEL,
    ),
    apiKeyEnc: typeof saved?.apiKeyEnc === "string" ? saved.apiKeyEnc : "",
    timeoutMs: clampInt(saved?.timeoutMs, 30_000, 900_000, DEFAULT_TIMEOUT_MS),
    contextLength: clampInt(saved?.contextLength, 2048, 32_768, DEFAULT_CONTEXT_LENGTH),
    maxOutput: clampInt(saved?.maxOutput, 256, 8192, DEFAULT_MAX_OUTPUT),
    keepAlive: normalizeKeepAlive(saved?.keepAlive),
  };
}

function envKey() {
  const value = process.env.ZEMIROT_ASSIST_API_KEY;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function resolveKey(saved) {
  const fromEnv = envKey();
  if (fromEnv) return fromEnv;
  if (!saved.apiKeyEnc) return "";
  try {
    return safeStorage.decryptString(Buffer.from(saved.apiKeyEnc, "base64"));
  } catch {
    return "";
  }
}

function publicSettings(saved) {
  const apiKey = resolveKey(saved);
  const model = saved.provider === "ollama" ? saved.ollamaModel : saved.openaiModel;
  return {
    provider: saved.provider,
    endpoint: saved.endpoint,
    ollamaUrl: saved.ollamaUrl,
    model,
    models: {
      ollama: saved.ollamaModel,
      openai: saved.openaiModel,
    },
    hasKey: Boolean(apiKey),
    ready:
      saved.provider === "ollama"
        ? Boolean(saved.ollamaUrl && model)
        : Boolean(apiKey && model),
    timeoutMs: saved.timeoutMs,
    contextLength: saved.contextLength,
    maxOutput: saved.maxOutput,
    keepAlive: saved.keepAlive,
  };
}

async function getSettings(userData) {
  return publicSettings(await readSettingsFile(userData));
}

async function resolvedSettings(userData) {
  const saved = await readSettingsFile(userData);
  return { ...publicSettings(saved), apiKey: resolveKey(saved) };
}

async function saveSettings(userData, input) {
  const current = await readSettingsFile(userData);
  const provider = normalizeProvider(input?.provider, current.provider);
  const endpoint = normalizeEndpoint(input?.endpoint ?? current.endpoint);
  const ollamaUrl = ollama.normalizeBaseUrl(input?.ollamaUrl ?? current.ollamaUrl);
  let ollamaModel = current.ollamaModel;
  let openaiModel = current.openaiModel;

  if (typeof input?.model === "string") {
    if (provider === "ollama") {
      ollamaModel = normalizeModel(input.model, current.ollamaModel);
    } else {
      openaiModel = normalizeModel(input.model, current.openaiModel);
    }
  }

  let apiKeyEnc = current.apiKeyEnc;
  if (input?.clearKey === true) {
    apiKeyEnc = "";
  } else if (typeof input?.apiKey === "string" && input.apiKey.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "This system's secure credential store is unavailable, so the key was not saved.",
      );
    }
    apiKeyEnc = safeStorage.encryptString(input.apiKey.trim()).toString("base64");
  }

  const saved = {
    provider,
    endpoint,
    ollamaUrl,
    ollamaModel,
    openaiModel,
    apiKeyEnc,
    timeoutMs: clampInt(input?.timeoutMs, 30_000, 900_000, current.timeoutMs),
    contextLength: clampInt(input?.contextLength, 2048, 32_768, current.contextLength),
    maxOutput: clampInt(input?.maxOutput, 256, 8192, current.maxOutput),
    keepAlive: normalizeKeepAlive(input?.keepAlive ?? current.keepAlive),
  };

  await writeJson(settingsPath(userData), saved);
  return publicSettings(saved);
}

async function checkOllama(userData, input) {
  const saved = await readSettingsFile(userData);
  const baseUrl = ollama.normalizeBaseUrl(input?.url ?? saved.ollamaUrl);
  const model = normalizeModel(input?.model ?? saved.ollamaModel, saved.ollamaModel);
  const status = await ollama.check(baseUrl, { timeoutMs: 5000 });
  return {
    ...status,
    model,
    modelInstalled: status.models.some((item) => modelTag(item.name) === modelTag(model)),
  };
}

async function getRecord(userData, id) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return readJson(recordPath(userData, id), null);
}

function parseModelJson(value) {
  let cleaned = String(value ?? "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function providerError(status, body) {
  let detail = "";
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message || parsed?.message || "";
  } catch {
    detail = String(body ?? "").slice(0, 300);
  }
  return `The provider returned HTTP ${status}${detail ? `: ${detail}` : "."}`;
}

function buildPayload(song, modes, contextLength) {
  const charLimit = Math.max(4000, Math.min(18_000, Math.floor(contextLength * 1.5)));
  const notesLimit = Math.min(4000, Math.floor(charLimit / 3));
  const hasSourceNotes = Boolean(String(song.information ?? "").trim());
  const hasTranslation = Boolean(String(song.translation ?? "").trim());
  return {
    hasSourceNotes,
    hasTranslation,
    payload: {
      titleEn: String(song.titleEn ?? "").slice(0, 300),
      titleHe: String(song.titleHe ?? "").slice(0, 300),
      language: song.language === "yi" ? "Yiddish" : "Hebrew or Aramaic",
      occasions: Array.isArray(song.occasions) ? song.occasions.slice(0, 12) : [],
      traditions: Array.isArray(song.traditions) ? song.traditions.slice(0, 12) : [],
      community: typeof song.community === "string" ? song.community.slice(0, 300) : "",
      nusach: typeof song.nusach === "string" ? song.nusach.slice(0, 300) : "",
      sourceNotes: String(song.information ?? "").slice(0, notesLimit),
      hebrew: String(song.hebrew ?? "").slice(0, charLimit),
      requests: {
        translation: modes.includes("translation") && !hasTranslation,
        description: modes.includes("context") && !hasSourceNotes,
        supplement: modes.includes("context") && hasSourceNotes,
      },
    },
  };
}

function buildMessages(song, modes, contextLength) {
  const { hasSourceNotes, hasTranslation, payload } = buildPayload(
    song,
    modes,
    contextLength,
  );
  const wantsTranslation = modes.includes("translation") && !hasTranslation;
  const wantsContext = modes.includes("context");
  const instructions = [
    wantsTranslation
      ? "Translate the song text into English. Preserve its line breaks."
      : 'Do not produce a translation; set "translation" to "".',
    wantsContext && !hasSourceNotes
      ? 'Write a 2–3 sentence description: what the song is, its occasion or tradition when the metadata supports it, and anything notable about its form. Set "supplement" to "".'
      : wantsContext && hasSourceNotes
        ? 'The source notes are supplied. Do not rewrite them. Write a short "supplement" (1–3 sentences) adding only concrete details that the source notes lack, using the metadata and the text. Set "description" to "".'
        : 'Set "description" and "supplement" to "".',
  ].join(" ");
  return {
    wantsTranslation,
    wantsContext,
    hasSourceNotes,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${instructions}\n\nSong data:\n${JSON.stringify(payload)}`,
      },
    ],
  };
}

function validateResult(content, wants) {
  const parsed = parseModelJson(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The model replied, but not with the expected JSON.");
  }
  const read = (key, limit) => {
    const value = parsed[key];
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (trimmed.length > limit) {
      throw new Error("The model returned an unusually long field; the draft was discarded.");
    }
    return trimmed;
  };
  const result = {
    translation: read("translation", 60_000),
    description: read("description", 3000),
    supplement: read("supplement", 3000),
  };
  if (wants.wantsTranslation && !result.translation) {
    throw new Error("The model returned an empty translation.");
  }
  if (wants.wantsContext && !wants.hasSourceNotes && !result.description) {
    throw new Error("The model returned an empty description.");
  }
  if (wants.wantsContext && wants.hasSourceNotes && !result.supplement) {
    throw new Error("The model returned an empty context note.");
  }
  return result;
}

function timeoutError(ms) {
  return new Error(
    `The draft timed out after ${Math.round(ms / 1000)} seconds. Try again, or raise the timeout in About.`,
  );
}

async function callOpenAI(settings, song, modes, signal) {
  const built = buildMessages(song, modes, settings.contextLength);
  const body = {
    model: settings.model,
    temperature: 0.2,
    max_tokens: settings.maxOutput,
    response_format: { type: "json_object" },
    messages: built.messages,
  };

  const request = async (withFormat) => {
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (signal) {
      if (signal.aborted) cancel();
      else signal.addEventListener("abort", cancel, { once: true });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, settings.timeoutMs);
    try {
      const response = await fetch(chatEndpoint(settings.endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
          "X-Title": "Zemirot Studio",
        },
        body: JSON.stringify(withFormat ? body : { ...body, response_format: undefined }),
        signal: controller.signal,
      });
      const responseText = await response.text();
      if (!response.ok) {
        const error = new Error(providerError(response.status, responseText));
        error.status = response.status;
        throw error;
      }
      try {
        return JSON.parse(responseText);
      } catch {
        throw new Error("The provider returned a malformed response.");
      }
    } catch (error) {
      if (controller.signal.aborted) {
        if (timedOut) throw timeoutError(settings.timeoutMs);
        throw new Error("Draft cancelled.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", cancel);
    }
  };

  let data;
  try {
    data = await request(true);
  } catch (error) {
    // Some OpenAI-compatible servers do not implement response_format. One
    // fallback keeps older local servers usable without a retry loop.
    if (error && error.status === 400) {
      data = await request(false);
    } else {
      throw error;
    }
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The provider returned no text.");
  }
  return validateResult(content, built);
}

async function callOllama(settings, song, modes, signal, onToken) {
  const built = buildMessages(song, modes, settings.contextLength);
  const response = await ollama.chat({
    baseUrl: settings.ollamaUrl,
    model: settings.model,
    messages: built.messages,
    format: RESULT_SCHEMA,
    options: {
      temperature: 0.2,
      num_ctx: settings.contextLength,
      num_predict: settings.maxOutput,
    },
    keepAlive: settings.keepAlive,
    timeoutMs: settings.timeoutMs,
    signal,
    onToken,
  });
  return validateResult(response.content, built);
}

function createProgress(onProgress) {
  if (!onProgress) return undefined;
  let lastAt = 0;
  let lastCharacters = 0;
  return (text) => {
    const characters = text.length;
    const now = Date.now();
    if (characters - lastCharacters < 48 && now - lastAt < 250) return;
    lastAt = now;
    lastCharacters = characters;
    onProgress({ characters });
  };
}

let activeGeneration = null;

function reserve(requestId) {
  if (activeGeneration) {
    throw new Error(
      "Another draft is already running. Wait for it to finish, or cancel it from the song page.",
    );
  }
  activeGeneration = { requestId, controller: new AbortController() };
  return activeGeneration.controller.signal;
}

function release(requestId) {
  if (activeGeneration?.requestId === requestId) activeGeneration = null;
}

function buildRecord(song, modes, result, settings, previous) {
  return {
    songId: song.id,
    translation:
      modes.includes("translation") && !String(song.translation ?? "").trim()
        ? result.translation
        : typeof previous?.translation === "string"
          ? previous.translation
          : "",
    description:
      modes.includes("context") && !String(song.information ?? "").trim()
        ? result.description
        : typeof previous?.description === "string"
          ? previous.description
          : "",
    supplement:
      modes.includes("context") && String(song.information ?? "").trim()
        ? result.supplement
        : typeof previous?.supplement === "string"
          ? previous.supplement
          : "",
    model: settings.model,
    provider: settings.provider,
    generatedAt: new Date().toISOString(),
    modes,
    caveat: CAVEAT,
  };
}

function prepareSong(song, modes) {
  if (!song || !Number.isSafeInteger(song.id) || song.id <= 0) {
    throw new Error("A song with a numeric id is required.");
  }
  const requested = Array.isArray(modes)
    ? modes.filter((mode) => mode === "translation" || mode === "context")
    : [];
  return requested.length > 0 ? [...new Set(requested)] : ["translation", "context"];
}

function assertReady(settings) {
  if (settings.provider === "ollama") {
    if (!settings.ollamaUrl || !settings.model) {
      throw new Error("Choose an Ollama model in About → Writing assistant before drafting.");
    }
    return;
  }
  if (!settings.apiKey) {
    throw new Error("No API key is saved. Add one in About → Writing assistant before drafting.");
  }
  if (!settings.model) {
    throw new Error("Choose an external model in About → Writing assistant before drafting.");
  }
}

async function runGeneration(userData, requestId, song, modes, onProgress = undefined) {
  const effectiveModes = prepareSong(song, modes);
  const settings = await resolvedSettings(userData);
  assertReady(settings);
  const signal = reserve(requestId);
  const progress = createProgress(onProgress);
  try {
    const result =
      settings.provider === "ollama"
        ? await callOllama(settings, song, effectiveModes, signal, progress)
        : await callOpenAI(settings, song, effectiveModes, signal);
    const previous = await getRecord(userData, song.id);
    const record = buildRecord(song, effectiveModes, result, settings, previous);
    await writeJson(recordPath(userData, song.id), record);
    return record;
  } finally {
    release(requestId);
  }
}

/**
 * Stream one draft. Progress contains only a character count; the raw JSON is
 * never shown or trusted until `validateResult` has accepted it.
 */
async function generateStreaming(userData, { requestId, song, modes }, onProgress) {
  if (
    typeof requestId !== "string" ||
    requestId.length < 8 ||
    requestId.length > 128 ||
    !/^[a-zA-Z0-9_-]+$/.test(requestId)
  ) {
    throw new Error("The draft request is malformed.");
  }
  return runGeneration(userData, requestId, song, modes, onProgress);
}

/** One-shot generation for the sequential batch workflow. */
async function generate(userData, { song, modes }) {
  return runGeneration(userData, `batch-${crypto.randomUUID()}`, song, modes);
}

function cancel(requestId) {
  if (activeGeneration?.requestId === requestId) {
    activeGeneration.controller.abort();
    return true;
  }
  return false;
}

module.exports = {
  CAVEAT,
  DEFAULT_CONTEXT_LENGTH,
  DEFAULT_KEEP_ALIVE,
  DEFAULT_MAX_OUTPUT,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OPENAI_ENDPOINT,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_TIMEOUT_MS,
  cancel,
  checkOllama,
  generate,
  generateStreaming,
  getRecord,
  getSettings,
  normalizeEndpoint,
  parseModelJson,
  saveSettings,
  validateResult,
};
