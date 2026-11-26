/**
 * Reports the Authenticode state of the built Windows artifacts.
 *
 *   npm run check:signature           # show status, always exit 0
 *   npm run check:signature -- --require   # exit 1 unless every file is Valid
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const releaseDir = path.resolve("release");
const requireSigned = process.argv.includes("--require");

const files = readdirSync(releaseDir)
  .filter((name) => name.toLowerCase().endsWith(".exe"))
  .map((name) => path.join(releaseDir, name))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

if (files.length === 0) {
  console.error("No .exe files in release/. Run `npm run package:win` first.");
  process.exit(1);
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function signatureOf(file) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$sig = Get-AuthenticodeSignature -LiteralPath ${psQuote(file)}`,
    "$cert = $sig.SignerCertificate",
    "[pscustomobject]@{",
    "  status = $sig.Status.ToString()",
    "  message = $sig.StatusMessage",
    "  signer = if ($cert) { $cert.Subject } else { $null }",
    "  thumbprint = if ($cert) { $cert.Thumbprint } else { $null }",
    "  notAfter = if ($cert) { $cert.NotAfter.ToString('yyyy-MM-dd') } else { $null }",
    "  timestamped = [bool]$sig.TimeStamperCertificate",
    "} | ConvertTo-Json -Compress",
  ].join("\n");

  // When npm runs under PowerShell 7 (as on GitHub's Windows runners), the
  // inherited PSModulePath points Windows PowerShell 5.1 at PowerShell 7's
  // modules, and Get-AuthenticodeSignature fails to load. Without it, 5.1
  // rebuilds its default module path.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "psmodulepath") delete env[key];
  }

  const output = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    env,
  });
  return JSON.parse(output.trim());
}

let unsigned = 0;

for (const file of files) {
  const info = signatureOf(file);
  const name = path.basename(file);
  const size = (statSync(file).size / 1024 / 1024).toFixed(1);

  if (info.status === "Valid") {
    console.log(`${name} — signed, ${size} MB`);
    console.log(`  signer      ${info.signer}`);
    console.log(`  expires     ${info.notAfter}`);
    console.log(`  timestamped ${info.timestamped ? "yes" : "no"}`);
  } else {
    unsigned += 1;
    console.log(`${name} — ${info.status} (${size} MB)`);
    console.log(`  ${info.message}`);
  }
}

if (unsigned > 0) {
  console.log(
    `\n${unsigned} of ${files.length} artifact(s) are not signed. Windows SmartScreen will warn ` +
      "on first run until a certificate is in place; see docs/signing-windows.md.",
  );
  if (requireSigned) process.exit(1);
}
