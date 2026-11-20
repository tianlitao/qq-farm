#!/usr/bin/env bash
# The project's own local chain: same genesis as the offckb devnet (so the same
# funded test accounts), its own data in ./devnet/data, RPC on 127.0.0.1:8214.
#
#   scripts/devnet.sh start | stop | status | reset
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${ROOT}/devnet"
RPC="http://127.0.0.1:8214"
CKB="${CKB_BIN:-}"

if [ -z "${CKB}" ]; then
    CKB="$(command -v ckb || true)"
fi
if [ -z "${CKB}" ]; then
    # The binary offckb downloaded.
    CKB="$(ls -d "${HOME}/Library/Application Support/offckb-nodejs/bins"/*/ckb 2>/dev/null | sort | tail -1 || true)"
fi
if [ -z "${CKB}" ] || [ ! -x "${CKB}" ]; then
    echo "no ckb binary found: install offckb (npm i -g @offckb/cli) or set CKB_BIN" >&2
    exit 1
fi

tip() {
    curl -s -m 3 -X POST "${RPC}" -H 'content-type: application/json' \
        -d '{"id":1,"jsonrpc":"2.0","method":"get_tip_block_number","params":[]}' 2>/dev/null \
        | sed -n 's/.*"result":"\(0x[0-9a-f]*\)".*/\1/p'
}

stop() {
    for name in node miner; do
        if [ -f "${DIR}/${name}.pid" ]; then
            kill "$(cat "${DIR}/${name}.pid")" 2>/dev/null || true
            rm -f "${DIR}/${name}.pid"
        fi
    done
}

case "${1:-start}" in
    start)
        if [ -n "$(tip)" ]; then
            echo "devnet already running, tip $(tip)"
            exit 0
        fi
        cd "${DIR}"
        nohup "${CKB}" run -C "${DIR}" > "${DIR}/node.log" 2>&1 &
        echo $! > "${DIR}/node.pid"
        for _ in $(seq 1 60); do
            [ -n "$(tip)" ] && break
            sleep 0.5
        done
        if [ -z "$(tip)" ]; then
            echo "the node did not come up, see ${DIR}/node.log" >&2
            exit 1
        fi
        nohup "${CKB}" miner -C "${DIR}" > "${DIR}/miner.log" 2>&1 &
        echo $! > "${DIR}/miner.pid"
        echo "devnet running at ${RPC}, tip $(tip)"
        ;;
    stop)
        stop
        echo "devnet stopped"
        ;;
    status)
        if [ -n "$(tip)" ]; then echo "running, tip $(tip)"; else echo "not running"; fi
        ;;
    reset)
        stop
        sleep 1
        rm -rf "${DIR}/data"
        echo "devnet data removed"
        ;;
    *)
        echo "usage: $0 start | stop | status | reset" >&2
        exit 2
        ;;
esac
