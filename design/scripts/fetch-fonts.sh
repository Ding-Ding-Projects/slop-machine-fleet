#!/usr/bin/env bash
# Downloads the complete bundled font files used by the design system from their
# npm packages (pinned versions) and copies them into design/design-system/fonts.
# Run from the repository root: bash design/scripts/fetch-fonts.sh
set -euo pipefail

GEIST_VERSION="1.3.1"
SYMBOLS_VERSION="0.27.0"
DEST="design/design-system/fonts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm pack --silent "geist@${GEIST_VERSION}" "material-symbols@${SYMBOLS_VERSION}" >/dev/null
mkdir geist symbols
tar -xzf "geist-${GEIST_VERSION}.tgz" -C geist
tar -xzf "material-symbols-${SYMBOLS_VERSION}.tgz" -C symbols
cd - >/dev/null

mkdir -p "$DEST"
cp "$WORK/geist/package/dist/fonts/geist-sans/Geist-Variable.woff2" "$DEST/"
cp "$WORK/geist/package/dist/fonts/geist-mono/GeistMono-Variable.woff2" "$DEST/"
cp "$WORK/symbols/package/material-symbols-rounded.woff2" "$DEST/MaterialSymbolsRounded.woff2"
cp "$WORK/geist/package/LICENSE.TXT" "$DEST/LICENSE-Geist.txt"
cp "$WORK/symbols/package/LICENSE" "$DEST/LICENSE-MaterialSymbols.txt"
echo "Fonts written to $DEST"
