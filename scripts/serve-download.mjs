#!/usr/bin/env node
/**
 * Serves a small download page plus the built Windows installer.
 *
 * The desktop workspace cannot hand large binaries to the user directly, so
 * this page runs on loopback: open it, click the button, and the installer is
 * downloaded by the browser from this machine. Nothing is uploaded.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseDir = path.join(projectRoot, "release");
const buildDir = path.join(projectRoot, "build");
const pagePath = path.join(projectRoot, "download", "index.html");

const pkg = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const version = pkg.version;
const fileName = `Zemirot-Studio-Setup-${version}.exe`;
const installerPath = path.join(releaseDir, fileName);

let installerStats;
try {
  installerStats = await stat(installerPath);
} catch {
  console.error(
    `Missing ${path.relative(projectRoot, installerPath)}. Run "npm run package:win" first.`,
  );
  process.exit(1);
}

const pageTemplate = await readFile(pagePath, "utf8");
const sha256 = await hashFile(installerPath);
const sizeLabel = `${(installerStats.size / 1_000_000).toFixed(0)} MB`;

const requestedPort = Number(process.env.PORT);
const port =
  Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536
    ? requestedPort
    : 4599;
const host = "127.0.0.1";

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/" || pathname === "/index.html") {
    const origin = `http://${host}:${server.address().port}`;
    const html = pageTemplate
      .replaceAll("{{VERSION}}", escapeHtml(version))
      .replaceAll("{{FILE}}", escapeHtml(fileName))
      .replaceAll("{{SIZE}}", sizeLabel)
      .replaceAll("{{SHA256}}", sha256)
      .replaceAll("{{ORIGIN}}", origin);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : html);
    return;
  }

  if (pathname === "/icon.png") {
    await sendStatic(path.join(buildDir, "icon-256.png"), "image/png", res, req);
    return;
  }

  if (pathname === `/download/${encodeURIComponent(fileName)}`) {
    await sendInstaller(req, res);
    return;
  }

  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

async function sendInstaller(req, res) {
  const headers = {
    "Content-Type": "application/vnd.microsoft.portable-executable",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Content-Length": installerStats.size,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), installerStats.size - 1) : installerStats.size - 1;
    if (start >= installerStats.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${installerStats.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${installerStats.size}`,
      "Accept-Ranges": "bytes",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(installerPath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, "Accept-Ranges": "bytes" });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(installerPath);
  stream.pipe(res);
  stream.on("error", (error) => {
    console.error("Failed to stream installer:", error.message);
    res.destroy(error);
  });
}

async function sendStatic(filePath, type, res, req) {
  try {
    const stats = await stat(filePath);
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": stats.size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is busy. Set PORT to another value and try again.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  const { port: boundPort } = server.address();
  console.log(`Download page: http://${host}:${boundPort}/`);
  console.log(`Installer:    ${fileName} (${sizeLabel})`);
  console.log(`SHA-256:      ${sha256}`);
});
