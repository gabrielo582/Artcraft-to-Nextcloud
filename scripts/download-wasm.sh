#!/usr/bin/env bash
set -euo pipefail

# Diretório raiz do projeto Nextcloud app (artcraft)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_DIR="${ROOT_DIR}/wasm"
TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

WORDCRAFT_VERSION="${WORDCRAFT_VERSION:-0.8.0}"
GRIDCRAFT_VERSION="${GRIDCRAFT_VERSION:-0.9.0}"
DECKCRAFT_VERSION="${DECKCRAFT_VERSION:-0.8.0}"

download_and_extract() {
    local module="$1"
    local repo="$2"
    local version="$3"
    local zip_name="${module}-web-${version}.zip"
    local base_url="https://github.com/${repo}/releases/download/v${version}"
    local target_dir="${WASM_DIR}/${module}"

    echo "==> Baixando ${module} v${version} (${zip_name})..."
    curl -fL --retry 3 -o "${TMP_DIR}/${zip_name}" "${base_url}/${zip_name}"
    curl -fL --retry 3 -o "${TMP_DIR}/${module}-SHA256SUMS.txt" "${base_url}/SHA256SUMS.txt"

    echo "==> Verificando checksum SHA256 de ${zip_name}..."
    local expected_hash
    expected_hash="$(grep " ${zip_name}\$" "${TMP_DIR}/${module}-SHA256SUMS.txt" | awk '{print $1}')"
    if [[ -z "${expected_hash}" ]]; then
        echo "ERRO: Hash não encontrado para ${zip_name} em SHA256SUMS.txt" >&2
        exit 1
    fi
    local actual_hash
    actual_hash="$(sha256sum "${TMP_DIR}/${zip_name}" | awk '{print $1}')"
    if [[ "${expected_hash}" != "${actual_hash}" ]]; then
        echo "ERRO: Checksum inválido para ${zip_name}! Esperado: ${expected_hash}, Obtido: ${actual_hash}" >&2
        exit 1
    fi
    echo "    SHA256 OK: ${actual_hash}"

    rm -rf "${target_dir}"
    mkdir -p "${target_dir}"

    local extract_dir="${TMP_DIR}/extract-${module}"
    mkdir -p "${extract_dir}"
    unzip -q "${TMP_DIR}/${zip_name}" -d "${extract_dir}"

    # Os zips de release extraem dentro de uma subpasta <module>-web-<version>/ ou na raiz
    if [[ -d "${extract_dir}/${module}-web-${version}" ]]; then
        cp -r "${extract_dir}/${module}-web-${version}/." "${target_dir}/"
    else
        cp -r "${extract_dir}/." "${target_dir}/"
    fi

    # Injeta o host-bridge.js e extrai o inline <script type="module"> para boot.js (compatibilidade total com CSP estrita do Nextcloud)
    if [[ -f "${target_dir}/index.html" ]]; then
        python3 - "${target_dir}" "${module}" "${version}" <<'PYEOF'
import base64, glob, hashlib, os, re, sys

target_dir, module, version = sys.argv[1], sys.argv[2], sys.argv[3]
index_path = os.path.join(target_dir, "index.html")
with open(index_path, "r", encoding="utf-8") as f:
    html = f.read()

# Patch DeckCraft v0.8.0 WASM binary where `recovery::instance_id()` calls `std::process::id()` on wasm32
if module == "deckcraft":
    for wasm_path in glob.glob(os.path.join(target_dir, "*.wasm")):
        data = bytearray(open(wasm_path, "rb").read())
        old_sig = bytes.fromhex("02037f017e230041106b220024004198c5db022d0000410347044020004190c5db02")
        idx = data.find(old_sig)
        if idx != -1:
            body_len = 252
            patch_instrs = bytes.fromhex(
                "4190c5db02"  # i32.const 0x56f890 (OnceLock<u64> value)
                "4280808008"  # i64.const 0x1000000 (1 << 24)
                "370300"      # i64.store align=8 offset=0
                "4198c5db02"  # i32.const 0x56f8b8 (OnceLock state)
                "4103"        # i32.const 3 (Once::COMPLETE)
                "3a0000"      # i32.store8 align=0 offset=0
            )
            nops = b"\x01" * (body_len - 5 - len(patch_instrs) - 1)
            new_body = bytes.fromhex("02037f017e") + patch_instrs + nops + b"\x0b"
            data[idx:idx + body_len] = new_body
            open(wasm_path, "wb").write(data)
            sri = "sha384-" + base64.b64encode(hashlib.sha384(data).digest()).decode()
            wasm_name = os.path.basename(wasm_path)
            html = re.sub(
                r'(<link rel="preload" href="\./' + re.escape(wasm_name) + r')("[^>]*integrity=")[^"]+(")',
                r'\1?v=patched1\2' + sri + r'\3',
                html,
            )
            html = html.replace(f"./{wasm_name}", f"./{wasm_name}?v=patched1")
            html = html.replace("?v=patched1?v=patched1", "?v=patched1")

m = re.search(r'<script type="module">\s*(.*?)\s*</script>', html, flags=re.DOTALL)
if m:
    boot_js = m.group(1).strip() + "\n"
    with open(os.path.join(target_dir, "boot.js"), "w", encoding="utf-8") as bf:
        bf.write(boot_js)
    html = html[:m.start()] + '<script type="module" src="./boot.js"></script>' + html[m.end():]

if "host-bridge.js" not in html:
    html = html.replace(
        "<head>",
        f'<head>\n  <script src="./host-bridge.js" data-module="{module}" data-version="{version}"></script>',
        1,
    )

with open(index_path, "w", encoding="utf-8") as f:
    f.write(html)
PYEOF
    fi

    # Copia o host-bridge.js se já existir em js/host-bridge.js
    if [[ -f "${ROOT_DIR}/js/host-bridge.js" ]]; then
        cp "${ROOT_DIR}/js/host-bridge.js" "${target_dir}/host-bridge.js"
    fi

    echo "==> ${module} v${version} instalado em ${target_dir}"
}

mkdir -p "${WASM_DIR}"

download_and_extract "wordcraft" "storytold/wordcraft" "${WORDCRAFT_VERSION}"
download_and_extract "gridcraft" "storytold/gridcraft" "${GRIDCRAFT_VERSION}"
download_and_extract "deckcraft" "storytold/deckcraft" "${DECKCRAFT_VERSION}"

echo "==> Todos os módulos WebAssembly do ArtCraft foram baixados e configurados com sucesso!"
