#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
STAGE_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "${STAGE_DIR}"
}
trap cleanup EXIT

for mod in wordcraft gridcraft deckcraft; do
    if [[ ! -d "${ROOT_DIR}/wasm/${mod}" ]]; then
        echo "==> Módulo WASM ${mod} ausente; executando scripts/download-wasm.sh..."
        "${ROOT_DIR}/scripts/download-wasm.sh"
        break
    fi
done

# Garante que as cópias do host-bridge.js nos módulos WASM estão sincronizadas
for mod in wordcraft gridcraft deckcraft; do
    cp "${ROOT_DIR}/js/host-bridge.js" "${ROOT_DIR}/wasm/${mod}/host-bridge.js"
done

APP_STAGE="${STAGE_DIR}/artcraft"
mkdir -p "${APP_STAGE}" "${DIST_DIR}"

cp -r \
    "${ROOT_DIR}/appinfo" \
    "${ROOT_DIR}/css" \
    "${ROOT_DIR}/img" \
    "${ROOT_DIR}/js" \
    "${ROOT_DIR}/lib" \
    "${ROOT_DIR}/templates" \
    "${ROOT_DIR}/wasm" \
    "${ROOT_DIR}/README.md" \
    "${ROOT_DIR}/CHANGELOG.md" \
    "${ROOT_DIR}/AI-POLICY.md" \
    "${ROOT_DIR}/CONTRIBUTING.md" \
    "${APP_STAGE}/"

ARCHIVE_PATH="${DIST_DIR}/artcraft.tar.gz"
tar -czf "${ARCHIVE_PATH}" -C "${STAGE_DIR}" artcraft

echo "==> Pacote de produção gerado com sucesso em: ${ARCHIVE_PATH}"
ls -lh "${ARCHIVE_PATH}"
