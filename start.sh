#!/usr/bin/env bash
# One command from a fresh checkout to a farm in the browser:
# local chain, script, deployment, neighbours, web page.
#
#   ./start.sh            start everything (Ctrl-C stops the page)
#   ./start.sh --no-bots  without the neighbour bots
#   ./start.sh stop       stop the chain and the neighbours
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"

stop_bots() {
    if [ -f "${ROOT}/devnet/bots.pid" ]; then
        kill "$(cat "${ROOT}/devnet/bots.pid")" 2>/dev/null || true
        rm -f "${ROOT}/devnet/bots.pid"
    fi
    # npm does not pass the signal on to the node processes under it, and two
    # sets of bots on the same accounts fight over the same cells.
    pkill -f "${ROOT}/web/node_modules/.*scripts/bots\.ts" 2>/dev/null || true
}

if [ "${1:-}" = "stop" ]; then
    stop_bots
    scripts/devnet.sh stop
    exit 0
fi

# The script and the rules are checked in as built files; rebuild when the toolchain is here.
if [ ! -f build/farm ]; then
    scripts/build-contract.sh
fi
if [ ! -f web/src/chain/farm_wasm.wasm ]; then
    scripts/build-wasm.sh
fi

scripts/devnet.sh start

cd web
[ -d node_modules ] || npm install
npm run -s deploy:devnet

if [ "${1:-}" != "--no-bots" ]; then
    stop_bots
    nohup npm run -s bots > "${ROOT}/devnet/bots.log" 2>&1 &
    echo $! > "${ROOT}/devnet/bots.pid"
    echo "neighbours are farming, log in devnet/bots.log (./start.sh stop ends them)"
fi

if curl -s -m 2 -o /dev/null http://localhost:5183; then
    echo "the page is already being served: open http://localhost:5183"
    exit 0
fi
echo "open http://localhost:5183"
npm run -s dev
