# Release Ernie for macOS

Ernie ships an Apple silicon `.app` inside a ZIP archive. The package contains
the built renderer, Electron main process, and the installed Prime Agent runtime
dependency graph.

## Build and verify locally

Run the required checks, then create the package:

```sh
nub run check
nub run package:mac
```

The packager brands the Electron application and helper processes, builds the
icon, copies the installed production dependency graph, signs the complete app,
verifies that signature, creates the ZIP archive, and writes its SHA-256 file.

Without `MACOS_SIGNING_IDENTITY`, the package uses ad hoc signing. This package
is suitable for development and private testing, but macOS Gatekeeper does not
treat it as an identified-developer download.

## Sign and notarize a distribution build

Set these values before `nub run package:mac`:

```sh
export MACOS_SIGNING_IDENTITY='Developer ID Application: Example (TEAMID)'
export APP_STORE_CONNECT_API_KEY_PATH='/absolute/path/AuthKey_KEYID.p8'
export APP_STORE_CONNECT_KEY_ID='KEYID'
export APP_STORE_CONNECT_ISSUER_ID='ISSUER-UUID'
```

The packager enables the hardened runtime, submits the ZIP with `notarytool`,
waits for Apple, staples the ticket to `Ernie.app`, and creates the final ZIP.

## Publish with GitHub Actions

The `Release macOS app` workflow accepts a version tag and prerelease flag. The
tag must equal `v` followed by the version in `package.json`.

```sh
gh workflow run release.yml \
  -f tag=v0.1.0 \
  -f prerelease=true
```

The workflow installs the locked dependencies, runs `nub run check`, builds the
Apple silicon package, preserves it as a workflow artifact, and creates the
GitHub release with the ZIP and checksum.

An identified-developer release requires these GitHub Actions secrets:

- `MACOS_CERTIFICATE_P12`: Base64-encoded Developer ID Application certificate.
- `MACOS_CERTIFICATE_PASSWORD`: Password for the PKCS#12 certificate.
- `MACOS_SIGNING_IDENTITY`: Full Developer ID Application identity.
- `APP_STORE_CONNECT_API_KEY`: Base64-encoded App Store Connect `.p8` key.
- `APP_STORE_CONNECT_KEY_ID`: App Store Connect key identifier.
- `APP_STORE_CONNECT_ISSUER_ID`: App Store Connect issuer identifier.

Leave all six secrets unset to publish an ad hoc private-testing build. Never
configure only part of the set.
