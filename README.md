# ArtCraft Office para Nextcloud (`artcraft`)

Integração nativa da suíte **ArtCraft Office** ([WordCraft](https://github.com/storytold/wordcraft), [GridCraft](https://github.com/storytold/gridcraft) e [DeckCraft](https://github.com/storytold/deckcraft)) para o **Nextcloud** (28–32+).

Diferente do Collabora Online ou OnlyOffice — que exigem servidores dedicados pesados em containers separados — os módulos do ArtCraft são escritos em Rust puro e compilados para **WebAssembly (`egui` + WebGPU/WebGL2)**, rodando 100% no navegador do usuário dentro do Nextcloud.

---

## Módulos Integrados

| Módulo | Equivalente | Formatos Suportados |
|---|---|---|
| **WordCraft** | Microsoft Word | `.docx`, `.docm`, `.dotx`, `.dotm`, `.doc`, `.dot`, `.odt`, `.rtf` (+ exportação `.pdf`) |
| **GridCraft** | Microsoft Excel | `.xlsx`, `.xlsm`, `.xls`, `.xlsb`, `.ods`, `.csv`, `.tsv` (+ exportação `.pdf`) |
| **DeckCraft** | Microsoft PowerPoint | `.pptx`, `.ppsx`, `.potx`, `.deckcraft` (+ exportação `.pdf`) |

---

## Funcionalidades

1. **Abertura Estilo Office Nativo no Nextcloud Files (Overlay em Tela Cheia)**
   - Clicar em qualquer documento compatível no app **Arquivos (Files)** abre o editor imediatamente em um modal tela cheia sobre a pasta atual.
   - Suporte a salvamento direto (`Ctrl+S` ou botão **Salvar** no topo) que grava de volta no Nextcloud WebDAV/Storage e gera nova versão automática no histórico do Nextcloud.
   - Exportar para **PDF** ou salvar arquivos legados (`.doc` $\rightarrow$ `.docx`, `.xls` $\rightarrow$ `.xlsx`) grava o novo arquivo automaticamente na mesma pasta do Nextcloud.
2. **Criação de Arquivos pelo Menu "+ Novo"**
   - Criação rápida de **Novo Documento (`.docx`)**, **Nova Planilha (`.xlsx`)** e **Nova Apresentação (`.pptx`)** com templates OOXML válidos.
3. **Abertura Direta de Anexos (Nextcloud Mail / Talk / Arquivos Locais)**
   - Permite abrir anexos de e-mail, links de chat ou arquivos locais diretamente nos editores WordCraft, GridCraft e DeckCraft e salvá-los na conta Nextcloud com 1 clique.
4. **Apps Dedicados na Barra Superior com Listagem de Arquivos por Módulo**
   - Adiciona **WordCraft**, **GridCraft** e **DeckCraft** na barra superior do Nextcloud.
   - Cada módulo exibe seus **Arquivos Recentes**, uma tabela completa com **todos os arquivos daquele módulo no Nextcloud do usuário**, busca instantânea por nome/pasta, ordenação e botão de criação.

---

## Instalação

### 1. Baixar os pacotes WebAssembly oficiais

Execute o script que baixa e verifica os hashes `SHA256` das releases oficiais do GitHub (`wordcraft-web`, `gridcraft-web`, `deckcraft-web`):

```bash
./scripts/download-wasm.sh
```

### 2. Instalar no Nextcloud

Copie (ou monte) este diretório em `custom_apps/artcraft` da sua instalação do Nextcloud e ative o aplicativo:

```bash
php occ app:enable artcraft
```

### 3. Ambiente de Desenvolvimento / Teste Rápido com Docker

```bash
docker compose up -d
docker compose exec -u www-data nextcloud php occ app:enable artcraft
```

Acesse `http://localhost:8080` (usuário `admin` / senha `adminpassword`).
