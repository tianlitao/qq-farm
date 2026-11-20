#!/usr/bin/env bash
# Build the rules for the browser -> web/src/chain/farm_wasm.wasm
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"
cargo build -p farm-wasm --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/farm_wasm.wasm web/src/chain/farm_wasm.wasm
ls -l web/src/chain/farm_wasm.wasm | awk '{ printf "built: %d bytes  %s\n", $5, $9 }'
