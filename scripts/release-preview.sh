#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 0 ]]; then
  echo 'Usage: nub run release:preview' >&2
  exit 1
fi
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit the candidate first.' >&2; exit 1; }
[[ "$(uname -sm)" == "Darwin arm64" ]] || { echo "Preview packaging requires an Apple Silicon Mac." >&2; exit 1; }
version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json")).version')
tag="v${version}"
notes="docs/releases/${version}.md"
[[ -f "$notes" ]] || { echo "Missing release notes: $notes" >&2; exit 1; }
[[ "$(node -p 'JSON.parse(require("fs").readFileSync("release.json")).branch')" == release-preview ]] || exit 1
repo=$(node -p 'JSON.parse(require("fs").readFileSync("release.json")).target')
sha=$(git rev-parse HEAD)
[[ -z "$(git ls-remote origin "refs/tags/$tag")" ]] || { echo 'Release tag already exists; inspect it before retrying.' >&2; exit 1; }
nub run release:check
nub run brand:check
nub run link
nub run typecheck
nub run lat:check
nub run release:build:unsigned
archive="dist/Ernie Preview-${version}-arm64-mac.zip"
[[ -f "$archive" ]] || { echo "Missing arm64 archive: $archive" >&2; exit 1; }
codesign --verify --deep --strict 'dist/mac-arm64/Ernie Preview.app'
(cd dist && shasum -a 256 "$(basename "$archive")" > SHA256SUMS)
mirror=$(git ls-remote origin refs/heads/release-preview)
if [[ -z "$mirror" ]]; then
  nub run publish:source init
else
  nub run publish:source push
fi
git push origin HEAD:refs/heads/thor/ernie-preview-release
git tag "$tag" "$sha"
git push origin "refs/tags/$tag"
gh release create "$tag" "$archive" dist/SHA256SUMS --repo "$repo" --verify-tag --prerelease --latest=false --title "Ernie Preview ${version} (unsigned)" --notes-file "$notes"
