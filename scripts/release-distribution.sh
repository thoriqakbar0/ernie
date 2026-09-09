#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 1 || ( "$1" != preview && "$1" != prod ) ]]; then
  echo 'Usage: release-distribution.sh preview|prod' >&2
  exit 1
fi
channel=$1
branch=release
product=Ernie
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit the candidate first.' >&2; exit 1; }
[[ "$(uname -sm)" == "Darwin arm64" ]] || { echo "Ernie packaging requires an Apple Silicon Mac." >&2; exit 1; }
version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json")).version')
tag="v${version}"
notes="docs/releases/${version}.md"
[[ -f "$notes" ]] || { echo "Missing release notes: $notes" >&2; exit 1; }
[[ "$(node -p 'JSON.parse(require("fs").readFileSync("release.json")).branch')" == "$branch" ]] || exit 1
repo=$(node -p 'JSON.parse(require("fs").readFileSync("release.json")).target')
sha=$(git rev-parse HEAD)
[[ -z "$(git ls-remote origin "refs/tags/$tag")" ]] || { echo 'Release tag already exists; inspect it before retrying.' >&2; exit 1; }
nub run release:check
nub run brand:check
nub run link
nub run typecheck
nub run lint:stylex
nub run lat:check
nub run release:build:unsigned
archive="dist/${product}-${version}-arm64-mac.zip"
[[ -f "$archive" ]] || { echo "Missing arm64 archive: $archive" >&2; exit 1; }
codesign --verify --deep --strict "dist/mac-arm64/${product}.app"
# GitHub replaces spaces in uploaded filenames with periods.
(cd dist && shasum -a 256 "$(basename "$archive")" | sed 's/  Ernie Preview-/  Ernie.Preview-/' > SHA256SUMS)
mirror=$(git ls-remote origin "refs/heads/$branch")
if [[ -z "$mirror" ]]; then
  nub run publish:source init
else
  nub run publish:source push
fi
candidate_branch=$(git symbolic-ref --quiet --short HEAD)
git push origin "HEAD:refs/heads/$candidate_branch"
git tag "$tag" "$sha"
git push origin "refs/tags/$tag"
release_flags=(--latest=true)
if [[ "$channel" == preview ]]; then release_flags=(--prerelease --latest=false); fi
gh release create "$tag" "$archive" dist/SHA256SUMS --repo "$repo" --verify-tag "${release_flags[@]}" --title "${product} ${version} (unsigned)" --notes-file "$notes"
