/**
 * Renders the NSIS artwork with Chromium's canvas so the installer uses the
 * same typefaces as the app. Run through `npm run art:installer`.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const outDir = path.join(root, "build");
const version = require(path.join(root, "package.json")).version;

async function render() {
  const win = new BrowserWindow({
    show: false,
    width: 640,
    height: 480,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: false,
    },
  });

  await win.loadFile(path.join(__dirname, "art.html"), { query: { version } });
  const files = await win.webContents.executeJavaScript("window.renderArt()", true);

  for (const [name, base64] of Object.entries(files)) {
    const target = path.join(outDir, name);
    fs.writeFileSync(target, Buffer.from(base64, "base64"));
    const { size } = fs.statSync(target);
    console.log(`  ${name.padEnd(22)} ${String(size).padStart(7)} bytes`);
  }

  win.destroy();
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    console.log("Rendering installer artwork");
    await render();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
