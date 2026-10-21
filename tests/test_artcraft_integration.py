#!/usr/bin/env python3
"""
Testes automatizados de integridade e integração do app Nextcloud `artcraft`:
1. Valida o manifesto `appinfo/info.xml`
2. Verifica o mapeamento de rotas em `appinfo/routes.php` contra os Controllers PHP
3. Verifica os bundles WebAssembly (`wordcraft`, `gridcraft`, `deckcraft`), `index.html`, `boot.js` (sem inline scripts bloqueáveis por CSP) e `host-bridge.js`
4. Verifica a estrutura dos scripts frontend (`artcraft-editor.js`, `artcraft-files.js`, `artcraft-hub.js`)
"""

import io
import os
import re
import subprocess
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


class ArtcraftNextcloudIntegrationTests(unittest.TestCase):
    def test_info_xml_is_valid(self):
        info_path = os.path.join(ROOT_DIR, "appinfo", "info.xml")
        self.assertTrue(os.path.isfile(info_path), "appinfo/info.xml deve existir")
        tree = ET.parse(info_path)
        root = tree.getroot()
        self.assertEqual(root.tag, "info")
        self.assertEqual(root.findtext("id"), "artcraft")
        self.assertEqual(root.findtext("namespace"), "Artcraft")
        nc_dep = root.find("./dependencies/nextcloud")
        self.assertIsNotNone(nc_dep, "Dependência do Nextcloud deve estar declarada")
        self.assertGreaterEqual(int(nc_dep.attrib["min-version"]), 28)

    def test_routes_match_controller_methods(self):
        routes_path = os.path.join(ROOT_DIR, "appinfo", "routes.php")
        with open(routes_path, "r", encoding="utf-8") as f:
            routes_src = f.read()

        route_names = re.findall(r"'name'\s*=>\s*'([^']+)'", routes_src)
        self.assertGreaterEqual(len(route_names), 10)

        controller_map = {
            "page": os.path.join(ROOT_DIR, "lib", "Controller", "PageController.php"),
            "file": os.path.join(ROOT_DIR, "lib", "Controller", "FileController.php"),
            "wasm": os.path.join(ROOT_DIR, "lib", "Controller", "WasmController.php"),
        }

        for rname in route_names:
            ctrl_key, method_name = rname.split("#", 1)
            self.assertIn(ctrl_key, controller_map)
            ctrl_file = controller_map[ctrl_key]
            self.assertTrue(os.path.isfile(ctrl_file), f"Controller {ctrl_file} ausente")
            with open(ctrl_file, "r", encoding="utf-8") as cf:
                ctrl_src = cf.read()
            self.assertRegex(
                ctrl_src,
                rf"public\s+function\s+{re.escape(method_name)}\s*\(",
                f"Método {method_name} não encontrado em {ctrl_file}",
            )

    def test_wasm_bundles_and_csp_safe_boot(self):
        for module in ("wordcraft", "gridcraft", "deckcraft"):
            mod_dir = os.path.join(ROOT_DIR, "wasm", module)
            self.assertTrue(os.path.isdir(mod_dir), f"Diretório wasm/{module} deve existir")

            index_path = os.path.join(mod_dir, "index.html")
            boot_path = os.path.join(mod_dir, "boot.js")
            bridge_path = os.path.join(mod_dir, "host-bridge.js")

            self.assertTrue(os.path.isfile(index_path), f"wasm/{module}/index.html ausente")
            self.assertTrue(os.path.isfile(boot_path), f"wasm/{module}/boot.js ausente")
            self.assertTrue(os.path.isfile(bridge_path), f"wasm/{module}/host-bridge.js ausente")

            with open(index_path, "r", encoding="utf-8") as f:
                html = f.read()

            # Garante que o host-bridge.js e o boot.js estão referenciados e que não há <script> inline
            self.assertIn('src="./host-bridge.js"', html)
            self.assertIn('src="./boot.js"', html)
            inline_scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>", html)
            self.assertEqual(
                len(inline_scripts),
                0,
                f"wasm/{module}/index.html não deve conter <script> inline (bloqueado pela CSP do Nextcloud)",
            )

            wasm_files = [f for f in os.listdir(mod_dir) if f.endswith(".wasm")]
            js_glue_files = [
                f
                for f in os.listdir(mod_dir)
                if f.endswith(".js") and f not in ("host-bridge.js", "boot.js")
            ]
            self.assertEqual(len(wasm_files), 1, f"Deve haver exatamente 1 arquivo .wasm em wasm/{module}")
            self.assertEqual(len(js_glue_files), 1, f"Deve haver exatamente 1 arquivo glue .js em wasm/{module}")

            # Verifica o magic header WebAssembly (\x00asm)
            wasm_full_path = os.path.join(mod_dir, wasm_files[0])
            with open(wasm_full_path, "rb") as wf:
                magic = wf.read(4)
            self.assertEqual(magic, b"\x00asm", f"Arquivo {wasm_full_path} não possui header WASM válido")

    def test_frontend_scripts_and_svg_icons(self):
        required_files = [
            "js/host-bridge.js",
            "js/artcraft-editor.js",
            "js/artcraft-files.js",
            "js/artcraft-hub.js",
            "css/artcraft.css",
            "templates/main.php",
            "img/app.svg",
            "img/wordcraft.svg",
            "img/gridcraft.svg",
            "img/deckcraft.svg",
        ]
        for rel in required_files:
            full = os.path.join(ROOT_DIR, rel)
            self.assertTrue(os.path.isfile(full), f"Arquivo obrigatório ausente: {rel}")
            self.assertGreater(os.path.getsize(full), 50, f"Arquivo vazio ou truncado: {rel}")

    def test_ooxml_template_generation_via_php(self):
        php_code = """
        require '/app/lib/Service/TemplateService.php';
        $svc = new \\OCA\\Artcraft\\Service\\TemplateService();
        $out = [
            'docx' => base64_encode($svc->createBlankContent('docx')),
            'xlsx' => base64_encode($svc->createBlankContent('xlsx')),
            'pptx' => base64_encode($svc->createBlankContent('pptx')),
        ];
        echo json_encode($out);
        """
        res = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{ROOT_DIR}:/app",
                "php:8.3-cli-alpine",
                "php",
                "-r",
                php_code,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        import base64
        import json

        payload = json.loads(res.stdout)
        expected_entries = {
            "docx": ["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
            "xlsx": ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml"],
            "pptx": ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/slides/slide1.xml"],
        }

        for fmt, required_members in expected_entries.items():
            raw_bytes = base64.b64decode(payload[fmt])
            with zipfile.ZipFile(io.BytesIO(raw_bytes), "r") as zf:
                self.assertIsNone(zf.testzip(), f"CRC ou estrutura ZIP inválida para .{fmt}")
                names = zf.namelist()
                for req_member in required_members:
                    self.assertIn(req_member, names, f"Entrada {req_member} ausente no template .{fmt}")
                    xml_bytes = zf.read(req_member)
                    ET.fromstring(xml_bytes)


if __name__ == "__main__":
    unittest.main(verbosity=2)
