# Signing the Windows build

The NSIS installer is an ordinary `.exe`, so Windows treats it like any other
downloaded program: without an Authenticode signature, SmartScreen shows
"Windows protected your PC" and the publisher reads as "Unknown publisher".

## What a signature can and cannot do

A signature proves who built the file and that it has not changed since. It also
gives SmartScreen a stable publisher identity to attach reputation to.

It does **not** remove the first-run prompt by itself. Microsoft's own guidance
is that a new publisher starts with no reputation, and SmartScreen may still
show "unrecognized app" while that reputation builds. That applies to OV and EV
certificates alike — EV no longer buys a first-download bypass. There is no
download threshold published, and no way to pre-seed reputation.

So the honest goal is:

1. Sign every release, so the identity and integrity are verifiable and
   reputation can accumulate under one publisher name.
2. Tell readers what to expect on the very first download, and give them a
   SHA-256 to check instead of asking them to trust the prompt.

Anyone who needs a warning-free install from day one needs a distribution
channel that re-signs the app — the Microsoft Store does that — or an existing,
well-known publisher identity.

## Options, as of 2026

| Route | Cost | Notes |
| --- | --- | --- |
| **Azure Trusted Signing** (formerly Trusted Signing) | Basic $9.99/month for 5,000 signatures | Keys live in Microsoft's HSM, so no USB token and CI-friendly. Organizations in the US, Canada, EU, UK, Australia, NZ, Japan, South Korea, Singapore, Switzerland, Norway and Israel can enrol for Public Trust; individual developers only in the US or Canada, and the Azure billing account must match the applicant's legal identity. A paid Azure subscription is required. |
| **SignPath Foundation** | Free for qualifying OSS | The Foundation is the publisher on the certificate, requires a public code-signing policy, verifiable builds and manual approval per release. Its documented connector is GitHub-hosted CI, which this project now uses directly. Approval has been reported at about a week. This project is applying through this route; [code-signing-policy.md](code-signing-policy.md) is the policy it publishes, and `.github/workflows/windows-installer.yml` builds the artifact the signing step consumes. |
| **Certum open-source cloud** | from about $58/year | Discounted tier aimed at free and open-source software; SimplySign cloud signing avoids a physical card. |
| **SSL.com OV / IV** | from about $129/year | Individual-validated (IV) is not the same as organization-validated (OV). Cloud signing or a token may cost extra. |
| **Sectigo OV/EV** | from about $536/year on multi-year terms | More than this app needs. |
| **Self-signed certificate** | free | Does not help: nobody trusts the root, and SmartScreen treats it as unsigned. |

Since June 2023 the CA/Browser Forum requires publicly trusted code-signing keys
to live in hardware or a CA-approved cloud service, so a plain `.pfx` on disk is
only realistic for a certificate issued under an older arrangement or for
internal use.

## Signing this project

`package.json` already sets SHA-256 and an RFC 3161 timestamp server
(`http://timestamp.digicert.com`), so a signature stays valid after the
certificate expires. Nothing else is needed until a certificate exists.

### A PFX file

electron-builder signs automatically when these are present:

```sh
export CSC_LINK=/path/to/certificate.pfx   # or a base64 blob
export CSC_KEY_PASSWORD='…'
npm run package:win
```

Keep the `.pfx` and its password out of the repository and out of chat.

### Azure Trusted Signing

Add the account details to the `win` block (they are not secrets):

```json
"win": {
  "azureSignOptions": {
    "publisherName": "Archaejon",
    "endpoint": "https://wus2.codesigning.azure.net/",
    "certificateProfileName": "zemirot-studio",
    "codeSigningAccountName": "archaejon-signing"
  }
}
```

Authenticate with the environment variables Microsoft's `Azure.Identity`
`EnvironmentCredential` reads:

```sh
export AZURE_TENANT_ID='…'
export AZURE_CLIENT_ID='…'
export AZURE_CLIENT_SECRET='…'
```

`azureSignOptions` replaces `signtoolOptions`, so remove the latter if you switch.

### Certum, SSL.com or another token/HSM provider

Those ship a `signtool` provider DLL. Sign after packaging and let electron-builder
skip its own step:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:win
signtool sign /sha1 <thumbprint> /tr http://timestamp.digicert.com /td sha256 /fd sha256 \
  release/Zemirot-Studio-Setup-1.3.1.exe
```

Use `/sha1` for a certificate in the Windows store, or the provider's
`/csp`/`/kc` switches for a cloud key.

## Checking a build

```sh
npm run check:signature            # lists every release/*.exe and its status
npm run check:signature -- --require   # fails if anything is unsigned
```

The equivalent by hand:

```powershell
Get-AuthenticodeSignature .\release\Zemirot-Studio-Setup-1.3.1.exe |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

A correctly signed, timestamped installer reports `Status: Valid` with both a
signer and a timestamp certificate.
