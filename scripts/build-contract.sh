#!/usr/bin/env bash
# Build the on-chain scripts for CKB-VM -> build/farm and build/type-id
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="riscv64imac-unknown-none-elf"

if ! rustup target list --installed | grep -q "^${TARGET}$"; then
    echo "rust target ${TARGET} is not installed: rustup target add ${TARGET}" >&2
    exit 1
fi

cd "${ROOT}/contracts"
cargo build --release --target "${TARGET}" -p farm -p type-id

mkdir -p "${ROOT}/build"
cp "target/${TARGET}/release/farm" "${ROOT}/build/farm"
cp "target/${TARGET}/release/type-id" "${ROOT}/build/type-id"
ls -l "${ROOT}/build/farm" "${ROOT}/build/type-id" | awk '{ printf "built: %d bytes  %s\n", $5, $9 }'
