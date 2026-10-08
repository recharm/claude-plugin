#!/usr/bin/env bash
# Build the ZIP we submit to the Codex plugin directory: the committed plugin
# minus the skills Codex should not ship. The Codex listing text lives in
# .codex-plugin/plugin.json and must only describe the skills that remain.
#
#   ./scripts/build-codex-zip.sh        ->  dist/recharm-codex-<version>.zip
#
# Packs the last commit (git archive), so uncommitted changes are not included.
set -euo pipefail

# Skills left out of the Codex build. make-video runs local scripts and install
# steps that Codex's security review rejects.
EXCLUDE_SKILLS=(make-video)

cd "$(git rev-parse --show-toplevel)"
command -v jq >/dev/null || { echo "jq is required: brew install jq" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || echo "warning: uncommitted changes are not included - commit first to ship them" >&2

version=$(jq -r .version .codex-plugin/plugin.json)
out="dist/recharm-codex-${version}.zip"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

git archive HEAD | tar -x -C "$stage"

for s in "${EXCLUDE_SKILLS[@]}"; do
  [ -d "$stage/skills/$s" ] || { echo "skills/$s not found - update EXCLUDE_SKILLS" >&2; exit 1; }
  rm -rf "$stage/skills/$s"
done

mkdir -p dist
rm -f "$out"
(cd "$stage" && zip -qr -X "$OLDPWD/$out" .)

echo "built $out"
echo "skills: $(ls "$stage/skills" | tr '\n' ' ')"
