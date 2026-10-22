# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-10-22

### Added
- Primeira release oficial do **ArtCraft Office** para Nextcloud.
- Integração nativa e cliente WebAssembly (Rust/egui) rodando 100% no navegador sem servidores adicionais:
  - **WordCraft**: processador de texto (.docx, .doc, .odt, .rtf).
  - **GridCraft**: planilhas eletrônicas (.xlsx, .xls, .ods, .csv, .tsv).
  - **DeckCraft**: apresentações de slides (.pptx, .ppsx, .potx, .deckcraft).
- Abertura direta e em tela cheia (overlay) a partir do aplicativo Arquivos (Files).
- Criação rápida de novos arquivos pelo dropdown **+ Novo** ("Criar documento", "Criar Planilha", "Criar apresentação").
- Salvamento automático integrado ao versionamento nativo do Nextcloud e atualização em tempo real da listagem de pastas.
- Página dedicada no menu superior com listagem paginada e busca de arquivos por módulo.
- Conformidade completa com a política de IA do Nextcloud (AI Contribution Policy).
