/**
 * Electron shell for Zemirot Studio.
 *
 * The app is a static Vite site, so the main process serves the built `dist`
 * folder over a loopback HTTP server and loads it in a normal Chromium window.
 * Serving over HTTP (rather than file://) keeps absolute asset paths, JSON
 * fetches, and the hash router working exactly as they do in a browser.
 *
 * New songs are fetched from the Zemirot Database into a snapshot folder under
 * userData. The same server prefers those files under /data/, so the bundled
 * app can stay a fixed snapshot while the archive keeps growing.
 */
const { app, BrowserWindow, Menu, Notification, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assist = require("./assist.cjs");

const DIST_DIR = path.join(__dirname, "..", "dist");
const SMOKE = process.env.ZS_SMOKE === "1";
// A stable origin matters: localStorage (theme, dialect, and songs the reader
// adds) is keyed by scheme, host, and port. A random port would look like a
// different site on every launch and silently hide those songs.
const PREFERRED_PORT = Number(process.env.ZS_PORT ?? 47823);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

let server = null;
let mainWindow = null;
let contentDir = null;
let activeCheck = null;
let autoCheckStarted = false;
let settings = { autoCheck: true };
let updateState = { lastChecked: null, addedLast: 0, liveCount: null, error: null };

/* -------------------------------------------------------------------------- */
/* Update storage                                                             */
/* -------------------------------------------------------------------------- */

const updateRoot = () => path.join(app.getPath("userData"), "archive-updates");
const pointerPath = () => path.join(app.getPath("userData"), "archive-pointer.json");
const statePath = () => path.join(app.getPath("userData"), "archive-state.json");
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
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

async function loadUpdateState() {
  const savedState = await readJson(statePath(), null);
  if (savedState && typeof savedState === "object") {
    updateState = {
      lastChecked: typeof savedState.lastChecked === "string" ? savedState.lastChecked : null,
      addedLast: Number(savedState.addedLast) || 0,
      liveCount: Number(savedState.liveCount) || null,
      error: typeof savedState.error === "string" ? savedState.error : null,
    };
  }

  const savedSettings = await readJson(settingsPath(), null);
  if (savedSettings && typeof savedSettings === "object") {
    settings = { autoCheck: savedSettings.autoCheck !== false };
  }

  const pointer = await readJson(pointerPath(), null);
  if (pointer && typeof pointer.dir === "string" && isInside(updateRoot(), pointer.dir)) {
    try {
      const stats = await fs.promises.stat(path.join(pointer.dir, "library.json"));
      if (stats.isFile()) contentDir = pointer.dir;
    } catch {
      // A partial or deleted snapshot falls back to the bundled files.
    }
  }
}

async function archiveCount() {
  const file = contentDir
    ? path.join(contentDir, "library.json")
    : path.join(DIST_DIR, "data", "library.json");
  const library = await readJson(file, null);
  return typeof library?.meta?.songCount === "number" ? library.meta.songCount : null;
}

async function pruneSnapshots(root, current) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  const old = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("snapshot-"))
    .map((entry) => path.join(root, entry.name))
    .filter((dir) => dir !== current)
    .sort();
  while (old.length > 1) {
    await fs.promises.rm(old.shift(), { recursive: true, force: true }).catch(() => {});
  }
}

function sendUpdateStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("updates:status", payload);
}

/**
 * Fetch songs published after the current snapshot.
 *
 * Only new song pages are read. The result is written to a staging folder and
 * swapped in as one pointer update, so a failed or interrupted check leaves
 * the previous library untouched.
 */
async function checkArchive() {
  if (activeCheck) return activeCheck;

  activeCheck = (async () => {
    const root = updateRoot();
    const staging = path.join(root, `staging-${Date.now()}`);
    await fs.promises.mkdir(root, { recursive: true });
    await fs.promises.rm(staging, { recursive: true, force: true });

    const libraryPath = contentDir
      ? path.join(contentDir, "library.json")
      : path.join(DIST_DIR, "data", "library.json");
    const detailsDirs = [];
    if (contentDir) detailsDirs.push(path.join(contentDir, "songs"));
    detailsDirs.push(path.join(DIST_DIR, "data", "songs"));

    sendUpdateStatus({ phase: "checking", message: "Checking zemirotdatabase.org…" });

    try {
      // The bundle is built by `npm run build:update`; it contains the parser,
      // cheerio, and the vocalization lexicon code in one CommonJS file.
      const { updateLibrary } = require("./update-library.cjs");
      const result = await updateLibrary({
        libraryPath,
        outputDir: staging,
        detailsDirs,
        log: (message) => console.log(`[update] ${message}`),
      });

      if (result.added.length > 0) {
        const finalDir = path.join(root, `snapshot-${Date.now()}`);
        await fs.promises.rename(staging, finalDir);
        await writeJson(pointerPath(), {
          dir: finalDir,
          checkedAt: result.checkedAt,
          added: result.added,
        });
        contentDir = finalDir;
        await pruneSnapshots(root, finalDir);

        if (!SMOKE && Notification.isSupported()) {
          const count = result.added.length;
          new Notification({
            title: "Zemirot Studio",
            body: `${count} new song${count === 1 ? "" : "s"} added from the Zemirot Database.`,
          }).show();
        }
      } else {
        await fs.promises.rm(staging, { recursive: true, force: true });
      }

      updateState = {
        lastChecked: result.checkedAt,
        addedLast: result.added.length,
        liveCount: result.liveCount,
        error: null,
      };
      await writeJson(statePath(), updateState);
      sendUpdateStatus({
        phase: "done",
        message:
          result.added.length > 0
            ? `Added ${result.added.length} new song${result.added.length === 1 ? "" : "s"}.`
            : "The library is up to date.",
        added: result.added.length,
      });

      return { ...result, reload: result.added.length > 0 };
    } catch (error) {
      await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      updateState = { ...updateState, error: message };
      await writeJson(statePath(), updateState).catch(() => {});
      sendUpdateStatus({ phase: "error", message });
      throw error;
    }
  })().finally(() => {
    activeCheck = null;
  });

  return activeCheck;
}

async function maybeAutoCheck() {
  if (!settings.autoCheck || SMOKE) return;
  try {
    const result = await checkArchive();
    if (result.reload && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  } catch (error) {
    console.warn(`[update] automatic check failed: ${error instanceof Error ? error.message : error}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Local server                                                               */
/* -------------------------------------------------------------------------- */

function sendFile(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
}

function listen(instance, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    instance.once("error", onError);
    instance.listen(port, "127.0.0.1", () => {
      instance.off("error", onError);
      resolve(instance.address().port);
    });
  });
}

async function resolveRequestPath(pathname) {
  if (pathname.startsWith("/data/") && contentDir) {
    // The overlay root corresponds to /data/: library.json sits beside songs/.
    const candidate = path.resolve(contentDir, pathname.slice("/data/".length));
    if (isInside(contentDir, candidate)) {
      const stats = await fs.promises.stat(candidate).catch(() => null);
      if (stats?.isFile()) return { filePath: candidate };
    }
  }

  const distPath = path.resolve(DIST_DIR, `.${pathname}`);
  if (distPath !== DIST_DIR && !distPath.startsWith(`${DIST_DIR}${path.sep}`)) {
    return { forbidden: true };
  }
  return { filePath: distPath };
}

async function startServer() {
  const instance = http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    if (pathname.endsWith("/")) pathname += "index.html";

    const resolved = await resolveRequestPath(pathname);
    if (resolved.forbidden) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const stats = await fs.promises.stat(resolved.filePath);
      if (!stats.isFile()) throw new Error("Not a file");
      sendFile(res, resolved.filePath);
    } catch {
      // The client uses hash routing, so unknown paths are missing assets.
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });

  server = instance;
  try {
    return await listen(instance, PREFERRED_PORT);
  } catch (error) {
    if (error && error.code === "EADDRINUSE") {
      console.warn(`Port ${PREFERRED_PORT} is busy; using a temporary port.`);
      return await listen(instance, 0);
    }
    throw error;
  }
}

function stopServer() {
  if (!server) return;
  server.close();
  server = null;
}

/* -------------------------------------------------------------------------- */
/* Menu, IPC, window                                                          */
/* -------------------------------------------------------------------------- */

function registerIpcHandlers() {
  ipcMain.handle("updates:info", async () => ({
    appVersion: app.getVersion(),
    lastChecked: updateState.lastChecked,
    addedLast: updateState.addedLast,
    liveCount: updateState.liveCount,
    error: updateState.error,
    autoCheck: settings.autoCheck,
    archiveCount: await archiveCount(),
  }));

  ipcMain.handle("updates:check", async () => checkArchive());

  ipcMain.handle("updates:set-auto-check", async (_event, value) => {
    settings.autoCheck = Boolean(value);
    await writeJson(settingsPath(), settings);
    return settings.autoCheck;
  });

  ipcMain.handle("assist:settings", () => assist.getSettings(app.getPath("userData")));

  ipcMain.handle("assist:save-settings", (_event, input) =>
    assist.saveSettings(app.getPath("userData"), input ?? {}),
  );

  ipcMain.handle("assist:check-ollama", (_event, input) =>
    assist.checkOllama(app.getPath("userData"), input ?? {}),
  );

  ipcMain.handle("assist:get", (_event, id) => assist.getRecord(app.getPath("userData"), Number(id)));

  ipcMain.handle("assist:generate", (_event, payload) =>
    assist.generate(app.getPath("userData"), {
      song: payload?.song,
      modes: payload?.modes,
    }),
  );

  ipcMain.handle("assist:generate-stream", (event, payload) => {
    const sender = event.sender;
    const requestId = String(payload?.requestId ?? "");
    return assist.generateStreaming(
      app.getPath("userData"),
      { requestId, song: payload?.song, modes: payload?.modes },
      (progress) => {
        if (!sender.isDestroyed()) {
          sender.send("assist:stream", { requestId, ...progress });
        }
      },
    );
  });

  ipcMain.on("assist:cancel", (_event, requestId) => {
    assist.cancel(String(requestId ?? ""));
  });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(SMOKE ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for New Songs…",
          click: () => {
            void checkArchive()
              .then((result) => {
                if (result.reload && mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.reload();
                }
              })
              .catch((error) => {
                console.warn(
                  `[update] check failed: ${error instanceof Error ? error.message : error}`,
                );
              });
          },
        },
        { type: "separator" },
        {
          label: "Open Zemirot Database",
          click: () => shell.openExternal("https://www.zemirotdatabase.org/"),
        },
      ],
    },
  ]);
}

async function createWindow() {
  const port = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Zemirot Studio",
    backgroundColor: "#f6f1e7",
    autoHideMenuBar: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!SMOKE) mainWindow?.show();
  });

  // Keep the app window on the bundled site; open everything else in the
  // user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`http://127.0.0.1:${port}/`)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  if (SMOKE) {
    const cards = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const count = document.querySelectorAll(".song-card").length;
          if (count > 0) return resolve(count);
          if (Date.now() - started > 8000) return resolve(0);
          setTimeout(tick, 100);
        };
        tick();
      })
    `);
    console.log(`SMOKE cards=${cards}`);
    app.exit(cards > 0 ? 0 : 1);
  }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.setName("Zemirot Studio");
  app.setAppUserModelId("com.zemirot.studio");

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    await loadUpdateState();
    registerIpcHandlers();
    Menu.setApplicationMenu(buildMenu());
    await createWindow();

    if (!autoCheckStarted) {
      autoCheckStarted = true;
      setTimeout(() => {
        void maybeAutoCheck();
      }, 2500);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("will-quit", stopServer);
}
