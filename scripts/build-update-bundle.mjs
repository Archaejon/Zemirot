/**
 * Bundle the in-app archive updater for the Electron main process.
 *
 * The updater reuses the build-time parser and cheerio, but the packaged app
 * deliberately ships no node_modules. esbuild produces one self-contained
 * CommonJS file under desktop/, which electron-builder already includes.
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

await build({
  entryPoints: [path.join(root, "scripts", "update-library.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: path.join(root, "desktop", "update-library.cjs"),
  legalComments: "none",
  logLevel: "info",
});
