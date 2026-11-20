#!/usr/bin/env bash
# Build the farm script for CKB-VM -> build/farm
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="riscv64imac-unknown-none-elf"

if ! rustup target list --installed | grep -q "^${TARGET}$"; then
    echo "rust target ${TARGET} is not installed: rustup target add ${TARGET}" >&2
    exit 1
fi

cd "${ROOT}/contracts"
cargo build --release --target "${TARGET}" -p farm

mkdir -p "${ROOT}/build"
cp "target/${TARGET}/release/farm" "${ROOT}/build/farm"
ls -l "${ROOT}/build/farm" | awk '{ printf "built: %d bytes  %s\n", $5, $9 }'
