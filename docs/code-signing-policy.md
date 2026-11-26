# Code-signing policy

Zemirot Studio asks the [SignPath Foundation](https://signpath.org/) to sign its
Windows releases. This page states what is signed, how it is built, and who
approves a release.

## What is signed

Only the Windows installer produced from a tagged commit in this repository:

- `Zemirot-Studio-Setup-<version>.exe` — the NSIS installer, including the
  application executable it carries.

Nothing else is submitted. Song data, drafts, and user files are never signed,
because they are never part of the installer as separate artifacts. The
publisher on the certificate is SignPath Foundation, acting on behalf of this
project.

## How a signed artifact is produced

1. A maintainer tags a commit on the GitHub repository (`v<version>`).
2. The same commit is built by the GitHub Actions workflow in
   `.github/workflows/windows-installer.yml`, on a GitHub-hosted Windows runner,
   from the repository contents alone. No local binary, prebuilt bundle, or
   side-loaded file is uploaded.
3. `npm ci` installs the pinned dependency tree from `package-lock.json`;
   `npm run package:win` type-checks, builds the renderer, renders the installer
   artwork, and packages the NSIS installer.
4. That workflow artifact is the only input to the signing step. The signing
   request names the version and the source commit, and a maintainer approves it
   in SignPath before the certificate is used.
5. The signed installer is attached to the matching release, next to its
   SHA-256.

## Who approves

The project maintainer (Archaejon) approves every signing request by hand. There
is no automated or scheduled signing, and no third party may request a signature
on the project's behalf. Multi-factor authentication is required on both the
GitHub and SignPath accounts involved.

## Keys and access

The signing key is held by SignPath Foundation and never reaches this project,
its CI, or its contributors. No private key, password, or HSM credential is
stored in the repository or in any release artifact.

## If something goes wrong

If a signed artifact is found to be malicious, or the build pipeline or an
account is suspected of compromise, the maintainer will:

1. ask SignPath to revoke the affected signature and stop further signing,
2. withdraw the release and its installer,
3. publish a replacement built from a reviewed commit.

Security reports go through the contact on the repository profile rather than a
public issue.

## Verification

Readers can confirm a signed installer on Windows:

```powershell
Get-AuthenticodeSignature .\Zemirot-Studio-Setup-1.3.1.exe |
  Format-List Status, SignerCertificate, TimeStamperCertificate
```

`Status: Valid` with a signer and a timestamp certificate means the file is
unchanged since it was signed. That is a different question from whether Windows
SmartScreen has yet learned to trust the publisher; see
[signing-windows.md](signing-windows.md).
