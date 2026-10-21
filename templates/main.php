<?php
/** @var array $_ */
/** @var \OCP\IL10N $l */
$module = isset($_['module']) ? (string)$_['module'] : 'wordcraft';
$displayName = isset($_['displayName']) ? (string)$_['displayName'] : '';
$initialFileId = isset($_['initialFileId']) && $_['initialFileId'] !== null ? (int)$_['initialFileId'] : '';
?>
<div id="artcraft-app"
     class="artcraft-hub-wrapper"
     data-active-module="<?php p($module); ?>"
     data-user-displayname="<?php p($displayName); ?>"
     data-initial-file-id="<?php p((string)$initialFileId); ?>">

    <!-- Barra lateral de navegação entre os módulos ArtCraft -->
    <aside class="artcraft-sidebar">
        <div class="artcraft-sidebar-header">
            <img src="<?php p(\OC::$server->getURLGenerator()->imagePath('artcraft', 'app.svg')); ?>" alt="ArtCraft" class="artcraft-brand-logo" />
            <div>
                <h1 class="artcraft-brand-title">ArtCraft Office</h1>
                <p class="artcraft-brand-subtitle">WebAssembly Suite</p>
            </div>
        </div>

        <nav class="artcraft-module-nav" aria-label="Módulos ArtCraft">
            <a href="<?php p(\OC::$server->getURLGenerator()->linkToRoute('artcraft.page.wordcraft')); ?>"
               class="artcraft-nav-item <?php p($module === 'wordcraft' ? 'is-active' : ''); ?>"
               data-module-switch="wordcraft">
                <img src="<?php p(\OC::$server->getURLGenerator()->imagePath('artcraft', 'wordcraft.svg')); ?>" alt="" />
                <div class="artcraft-nav-text">
                    <span class="artcraft-nav-title">WordCraft</span>
                    <span class="artcraft-nav-desc">Documentos (.docx, .odt, .rtf)</span>
                </div>
            </a>

            <a href="<?php p(\OC::$server->getURLGenerator()->linkToRoute('artcraft.page.gridcraft')); ?>"
               class="artcraft-nav-item <?php p($module === 'gridcraft' ? 'is-active' : ''); ?>"
               data-module-switch="gridcraft">
                <img src="<?php p(\OC::$server->getURLGenerator()->imagePath('artcraft', 'gridcraft.svg')); ?>" alt="" />
                <div class="artcraft-nav-text">
                    <span class="artcraft-nav-title">GridCraft</span>
                    <span class="artcraft-nav-desc">Planilhas (.xlsx, .ods, .csv)</span>
                </div>
            </a>

            <a href="<?php p(\OC::$server->getURLGenerator()->linkToRoute('artcraft.page.deckcraft')); ?>"
               class="artcraft-nav-item <?php p($module === 'deckcraft' ? 'is-active' : ''); ?>"
               data-module-switch="deckcraft">
                <img src="<?php p(\OC::$server->getURLGenerator()->imagePath('artcraft', 'deckcraft.svg')); ?>" alt="" />
                <div class="artcraft-nav-text">
                    <span class="artcraft-nav-title">DeckCraft</span>
                    <span class="artcraft-nav-desc">Apresentações (.pptx, .deckcraft)</span>
                </div>
            </a>
        </nav>

        <div class="artcraft-sidebar-footer">
            <p class="artcraft-sidebar-tip">
                <strong>Dica:</strong> Você também pode clicar diretamente em qualquer arquivo Office no app <em>Arquivos</em> ou abrir anexos direto pelo <em>Mail</em>.
            </p>
        </div>
    </aside>

    <!-- Conteúdo Principal do Módulo -->
    <main class="artcraft-main">
        <header class="artcraft-hero" id="artcraft-hero">
            <div class="artcraft-hero-info">
                <img id="artcraft-hero-icon"
                     src="<?php p(\OC::$server->getURLGenerator()->imagePath('artcraft', $module . '.svg')); ?>"
                     alt=""
                     class="artcraft-hero-logo" />
                <div>
                    <h2 id="artcraft-hero-title" class="artcraft-hero-title">WordCraft</h2>
                    <p id="artcraft-hero-subtitle" class="artcraft-hero-subtitle">
                        Todos os arquivos compatíveis no seu Nextcloud
                    </p>
                </div>
            </div>

            <div class="artcraft-hero-actions">
                <input type="file" id="artcraft-local-file-input" class="artcraft-sr-only" />
                <button type="button" class="artcraft-btn artcraft-btn-outline" id="artcraft-btn-open-local" title="Abrir um arquivo ou anexo local direto no editor">
                    <span>Abrir Anexo / Arquivo Local</span>
                </button>
                <button type="button" class="artcraft-btn artcraft-btn-create" id="artcraft-btn-create-new">
                    <span id="artcraft-btn-create-label">+ Novo Documento</span>
                </button>
            </div>
        </header>

        <!-- Barra de busca e filtros -->
        <section class="artcraft-toolbar" aria-label="Filtros de arquivos">
            <div class="artcraft-search-box">
                <input type="search"
                       id="artcraft-search-input"
                       class="artcraft-search-input"
                       placeholder="Pesquisar arquivos por nome ou pasta…"
                       autocomplete="off" />
            </div>
            <div class="artcraft-toolbar-right">
                <label for="artcraft-sort-select" class="artcraft-sort-label">Ordenar por:</label>
                <select id="artcraft-sort-select" class="artcraft-sort-select">
                    <option value="mtime">Modificados recentemente</option>
                    <option value="name">Nome (A–Z)</option>
                    <option value="size">Tamanho</option>
                </select>
                <button type="button" class="artcraft-btn artcraft-btn-icon" id="artcraft-btn-refresh" title="Atualizar lista de arquivos">
                    <span>↻ Atualizar</span>
                </button>
            </div>
        </section>

        <!-- Seção de Arquivos Recentes -->
        <section class="artcraft-recent-section" id="artcraft-recent-section" hidden>
            <h3 class="artcraft-section-heading">Recentes</h3>
            <div class="artcraft-recent-grid" id="artcraft-recent-grid"></div>
        </section>

        <!-- Lista Completa de Arquivos do Módulo -->
        <section class="artcraft-files-section">
            <div class="artcraft-section-header">
                <h3 class="artcraft-section-heading" id="artcraft-list-heading">Todos os arquivos</h3>
                <span class="artcraft-file-count" id="artcraft-file-count"></span>
            </div>

            <div id="artcraft-loading-state" class="artcraft-state-box">
                <div class="artcraft-spinner"></div>
                <p>Buscando arquivos no seu Nextcloud…</p>
            </div>

            <div id="artcraft-empty-state" class="artcraft-state-box" hidden>
                <p id="artcraft-empty-message">Nenhum arquivo encontrado para este módulo no seu Nextcloud.</p>
                <button type="button" class="artcraft-btn artcraft-btn-create" id="artcraft-btn-empty-create">
                    <span>+ Criar Primeiro Arquivo</span>
                </button>
            </div>

            <div class="artcraft-table-container" id="artcraft-table-container" hidden>
                <table class="artcraft-files-table">
                    <thead>
                        <tr>
                            <th>Nome do Arquivo</th>
                            <th>Pasta no Nextcloud</th>
                            <th>Tamanho</th>
                            <th>Última Modificação</th>
                            <th class="artcraft-col-actions">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="artcraft-files-tbody"></tbody>
                </table>
            </div>

            <nav class="artcraft-pagination" id="artcraft-pagination" aria-label="Paginação de arquivos" hidden>
                <div class="artcraft-pagination-left">
                    <span class="artcraft-pagination-info" id="artcraft-pagination-info"></span>
                    <label for="artcraft-perpage-select" class="artcraft-perpage-label">Por página:</label>
                    <select id="artcraft-perpage-select" class="artcraft-sort-select artcraft-perpage-select">
                        <option value="10">10</option>
                        <option value="20" selected>20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>
                <div class="artcraft-pagination-controls" id="artcraft-pagination-controls"></div>
            </nav>
        </section>
    </main>
</div>
