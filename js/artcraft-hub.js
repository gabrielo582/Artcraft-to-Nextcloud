/**
 * ArtCraft Office - Module Hub Page Controller (WordCraft, GridCraft, DeckCraft)
 *
 * Lists all compatible files across the user's Nextcloud account for the selected
 * module, provides search/sort, Recent files cards, 1-click file creation,
 * and local file / attachment direct opening.
 */
(function (window, document) {
	'use strict';

	const MODULE_UI = {
		wordcraft: {
			title: 'WordCraft',
			subtitle: 'Todos os documentos de texto (.docx, .doc, .odt, .rtf) no seu Nextcloud',
			createLabel: '+ Novo Documento (.docx)',
			defaultFileName: 'Novo Documento.docx',
			listHeading: 'Todos os arquivos do WordCraft',
			accept: '.docx,.docm,.dotx,.dotm,.doc,.dot,.odt,.rtf,.txt,.md,.html',
			color: '#2B579A',
		},
		gridcraft: {
			title: 'GridCraft',
			subtitle: 'Todas as planilhas eletrônicas (.xlsx, .xls, .ods, .csv, .tsv) no seu Nextcloud',
			createLabel: '+ Nova Planilha (.xlsx)',
			defaultFileName: 'Nova Planilha.xlsx',
			listHeading: 'Todos os arquivos do GridCraft',
			accept: '.xlsx,.xlsm,.xls,.xlsb,.ods,.csv,.tsv',
			color: '#217346',
		},
		deckcraft: {
			title: 'DeckCraft',
			subtitle: 'Todas as apresentações de slides (.pptx, .ppsx, .potx, .deckcraft) no seu Nextcloud',
			createLabel: '+ Nova Apresentação (.pptx)',
			defaultFileName: 'Nova Apresentacao.pptx',
			listHeading: 'Todos os arquivos do DeckCraft',
			accept: '.pptx,.ppsx,.potx,.deckcraft',
			color: '#D24726',
		},
	};

	function formatSize(bytes) {
		const n = Number(bytes) || 0;
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / (1024 * 1024)).toFixed(2)} MB`;
	}

	function formatDate(timestampSec) {
		if (!timestampSec) return '—';
		const date = new Date(Number(timestampSec) * 1000);
		const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
		if (diffSec >= 0 && diffSec < 60) return 'Agora mesmo';
		if (diffSec >= 60 && diffSec < 3600) return `há ${Math.floor(diffSec / 60)} min`;
		if (diffSec >= 3600 && diffSec < 86400) return `há ${Math.floor(diffSec / 3600)} h`;
		return date.toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function escapeHtml(str) {
		const div = document.createElement('div');
		div.textContent = str == null ? '' : String(str);
		return div.innerHTML;
	}

	function initHub() {
		const root = document.getElementById('artcraft-app');
		if (!root) return;

		let activeModule = (root.getAttribute('data-active-module') || 'wordcraft').toLowerCase();
		let pageFiles = [];
		let recentFiles = [];
		let searchQuery = '';
		let sortBy = 'mtime';
		let currentPage = 1;
		let perPage = 20;
		let paginationMeta = {
			page: 1,
			perPage: 20,
			total: 0,
			totalPages: 1,
			hasPrev: false,
			hasNext: false,
		};
		let searchDebounceTimer = null;

		const heroEl = document.getElementById('artcraft-hero');
		const heroIcon = document.getElementById('artcraft-hero-icon');
		const heroTitle = document.getElementById('artcraft-hero-title');
		const heroSubtitle = document.getElementById('artcraft-hero-subtitle');
		const createBtn = document.getElementById('artcraft-btn-create-new');
		const createLabel = document.getElementById('artcraft-btn-create-label');
		const emptyCreateBtn = document.getElementById('artcraft-btn-empty-create');
		const openLocalBtn = document.getElementById('artcraft-btn-open-local');
		const localFileInput = document.getElementById('artcraft-local-file-input');
		const searchInput = document.getElementById('artcraft-search-input');
		const sortSelect = document.getElementById('artcraft-sort-select');
		const refreshBtn = document.getElementById('artcraft-btn-refresh');
		const recentSection = document.getElementById('artcraft-recent-section');
		const recentGrid = document.getElementById('artcraft-recent-grid');
		const listHeading = document.getElementById('artcraft-list-heading');
		const fileCount = document.getElementById('artcraft-file-count');
		const loadingState = document.getElementById('artcraft-loading-state');
		const emptyState = document.getElementById('artcraft-empty-state');
		const tableContainer = document.getElementById('artcraft-table-container');
		const tbody = document.getElementById('artcraft-files-tbody');
		const paginationNav = document.getElementById('artcraft-pagination');
		const paginationInfo = document.getElementById('artcraft-pagination-info');
		const perPageSelect = document.getElementById('artcraft-perpage-select');
		const paginationControls = document.getElementById('artcraft-pagination-controls');

		function applyModuleChrome(mod) {
			const ui = MODULE_UI[mod] || MODULE_UI.wordcraft;
			root.setAttribute('data-active-module', mod);
			root.style.setProperty('--artcraft-accent', ui.color);
			if (heroEl) heroEl.style.setProperty('--artcraft-accent', ui.color);
			if (heroIcon && window.OCA?.Artcraft?.imagePath) {
				heroIcon.src = window.OCA.Artcraft.imagePath(`${mod}.svg`);
			}
			if (heroTitle) heroTitle.textContent = ui.title;
			if (heroSubtitle) heroSubtitle.textContent = ui.subtitle;
			if (createLabel) createLabel.textContent = ui.createLabel;
			if (listHeading) listHeading.textContent = ui.listHeading;
			if (localFileInput) localFileInput.setAttribute('accept', ui.accept);

			document.querySelectorAll('.artcraft-nav-item[data-module-switch]').forEach((item) => {
				const isMatch = item.getAttribute('data-module-switch') === mod;
				item.classList.toggle('is-active', isMatch);
			});
		}

		async function fetchModuleFiles(mod) {
			loadingState.hidden = false;
			emptyState.hidden = true;
			tableContainer.hidden = true;
			if (paginationNav) paginationNav.hidden = true;
			recentSection.hidden = true;

			try {
				const params = new URLSearchParams({
					page: String(currentPage),
					perPage: String(perPage),
					sort: sortBy,
				});
				if (searchQuery.trim() !== '') {
					params.set('q', searchQuery.trim());
				}
				const url =
					window.OCA.Artcraft.generateUrl(`/apps/artcraft/api/files/list/${mod}`) +
					'?' +
					params.toString();
				const resp = await fetch(url, {
					headers: {
						requesttoken: window.OCA.Artcraft.getRequestToken(),
					},
				});
				if (!resp.ok) {
					throw new Error(`HTTP ${resp.status}`);
				}
				const data = await resp.json();
				pageFiles = Array.isArray(data.files) ? data.files : [];
				recentFiles = Array.isArray(data.recent) ? data.recent : [];
				if (data.pagination) {
					paginationMeta = {
						page: Number(data.pagination.page) || 1,
						perPage: Number(data.pagination.perPage) || perPage,
						total: Number(data.pagination.total) || 0,
						totalPages: Number(data.pagination.totalPages) || 1,
						hasPrev: Boolean(data.pagination.hasPrev),
						hasNext: Boolean(data.pagination.hasNext),
					};
					currentPage = paginationMeta.page;
				} else {
					paginationMeta = {
						page: 1,
						perPage,
						total: pageFiles.length,
						totalPages: 1,
						hasPrev: false,
						hasNext: false,
					};
				}
				renderFiles();
			} catch (err) {
				console.error('[ArtCraft Hub] Erro ao listar arquivos:', err);
				loadingState.hidden = true;
				emptyState.hidden = false;
				if (paginationNav) paginationNav.hidden = true;
				const msg = document.getElementById('artcraft-empty-message');
				if (msg) {
					msg.textContent = 'Erro ao carregar a lista de arquivos: ' + err.message;
				}
			}
		}

		function buildPageNumbers(current, total) {
			if (total <= 7) {
				return Array.from({ length: total }, (_, i) => i + 1);
			}
			const pages = [1];
			if (current > 3) {
				pages.push('…');
			}
			const start = Math.max(2, current - 1);
			const end = Math.min(total - 1, current + 1);
			for (let p = start; p <= end; p++) {
				pages.push(p);
			}
			if (current < total - 2) {
				pages.push('…');
			}
			pages.push(total);
			return pages;
		}

		function renderPagination() {
			if (!paginationNav || !paginationInfo || !paginationControls) {
				return;
			}
			const { page, total, totalPages } = paginationMeta;
			if (total === 0) {
				paginationNav.hidden = true;
				return;
			}

			paginationNav.hidden = false;
			const startIdx = (page - 1) * perPage + 1;
			const endIdx = Math.min(total, startIdx + pageFiles.length - 1);
			paginationInfo.textContent = `Mostrando ${startIdx}–${endIdx} de ${total} ${
				total === 1 ? 'arquivo' : 'arquivos'
			}`;

			const pageList = buildPageNumbers(page, totalPages);
			const buttonsHtml = [];

			buttonsHtml.push(`
				<button type="button"
						class="artcraft-page-btn"
						data-page="${page - 1}"
						${page <= 1 ? 'disabled' : ''}
						title="Página anterior">
					« Anterior
				</button>
			`);

			for (const item of pageList) {
				if (item === '…') {
					buttonsHtml.push('<span class="artcraft-page-ellipsis">…</span>');
				} else {
					const isCurrent = item === page;
					buttonsHtml.push(`
						<button type="button"
								class="artcraft-page-btn ${isCurrent ? 'is-active' : ''}"
								data-page="${item}"
								${isCurrent ? 'aria-current="page"' : ''}>
							${item}
						</button>
					`);
				}
			}

			buttonsHtml.push(`
				<button type="button"
						class="artcraft-page-btn"
						data-page="${page + 1}"
						${page >= totalPages ? 'disabled' : ''}
						title="Próxima página">
					Próxima »
				</button>
			`);

			paginationControls.innerHTML = buttonsHtml.join('');
		}

		function renderFiles() {
			loadingState.hidden = true;

			const q = searchQuery.trim();
			const total = paginationMeta.total;

			fileCount.textContent = `${total} ${total === 1 ? 'arquivo' : 'arquivos'}`;

			if (total === 0 || pageFiles.length === 0) {
				emptyState.hidden = false;
				tableContainer.hidden = true;
				if (paginationNav) paginationNav.hidden = true;
				recentSection.hidden = true;
				const msg = document.getElementById('artcraft-empty-message');
				if (msg) {
					msg.textContent = q
						? `Nenhum arquivo corresponde à pesquisa "${searchQuery}".`
						: `Nenhum arquivo encontrado para o ${MODULE_UI[activeModule]?.title || activeModule} no seu Nextcloud.`;
				}
				return;
			}

			emptyState.hidden = true;
			tableContainer.hidden = false;

			// Render Recent cards (up to 4 most recent when no search filter is active and on page 1)
			if (!q && currentPage === 1 && recentFiles.length > 0) {
				recentSection.hidden = false;
				recentGrid.innerHTML = recentFiles
					.map(
						(file) => `
						<button type="button" class="artcraft-recent-card" data-open-id="${file.id}">
							<img src="${window.OCA.Artcraft.imagePath(activeModule + '.svg')}" alt="" class="artcraft-recent-icon" />
							<div class="artcraft-recent-meta">
								<span class="artcraft-recent-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
								<span class="artcraft-recent-sub">${escapeHtml(file.folder)} · ${formatDate(file.mtime)}</span>
							</div>
						</button>
					`
					)
					.join('');
			} else {
				recentSection.hidden = true;
			}

			// Render main table rows for the current page
			tbody.innerHTML = pageFiles
				.map((file) => {
					const filesAppUrl = window.OCA.Artcraft.generateUrl(
						`/apps/files/?dir=${encodeURIComponent(file.folder || '/')}`
					);
					const downloadUrl = window.OCA.Artcraft.generateUrl(
						`/apps/artcraft/api/files/${file.id}/content`
					);
					return `
						<tr class="artcraft-file-row" data-file-id="${file.id}">
							<td class="artcraft-cell-name">
								<button type="button" class="artcraft-file-link" data-open-id="${file.id}">
									<img src="${window.OCA.Artcraft.imagePath(activeModule + '.svg')}" alt="" class="artcraft-row-icon" />
									<span class="artcraft-row-filename">${escapeHtml(file.name)}</span>
									<span class="artcraft-ext-badge">.${escapeHtml(file.extension)}</span>
								</button>
							</td>
							<td class="artcraft-cell-folder">
								<a href="${filesAppUrl}" class="artcraft-folder-link" title="Abrir pasta no Nextcloud Files">
									${escapeHtml(file.folder || '/')}
								</a>
							</td>
							<td class="artcraft-cell-size">${formatSize(file.size)}</td>
							<td class="artcraft-cell-date">${formatDate(file.mtime)}</td>
							<td class="artcraft-cell-actions">
								<button type="button" class="artcraft-btn artcraft-btn-sm artcraft-btn-open" data-open-id="${file.id}">
									Abrir
								</button>
								<a href="${downloadUrl}" download="${escapeHtml(file.name)}" class="artcraft-btn artcraft-btn-sm artcraft-btn-ghost" title="Baixar arquivo">
									↓
								</a>
							</td>
						</tr>
					`;
				})
				.join('');

			renderPagination();
		}

		function openFileFromList(fileId) {
			const file =
				pageFiles.find((f) => Number(f.id) === Number(fileId)) ||
				recentFiles.find((f) => Number(f.id) === Number(fileId));
			window.OCA.Artcraft.Editor.openFileById({
				fileId: Number(fileId),
				fileName: file?.name,
				folderPath: file?.folder,
				module: activeModule,
				writable: file?.writable !== false,
				onSaved: () => {
					fetchModuleFiles(activeModule);
				},
			});
		}

		async function handleCreateNewFile() {
			const ui = MODULE_UI[activeModule] || MODULE_UI.wordcraft;
			const suggested = ui.defaultFileName;
			const entered = window.prompt('Nome do novo arquivo:', suggested);
			if (entered === null) {
				return;
			}
			const finalName = entered.trim() || suggested;
			await window.OCA.Artcraft.Editor.createAndOpenNewFile({
				module: activeModule,
				fileName: finalName,
				dir: '/',
				onSaved: () => {
					fetchModuleFiles(activeModule);
				},
				onClosed: () => {
					fetchModuleFiles(activeModule);
				},
			});
			fetchModuleFiles(activeModule);
		}

		// Event listeners
		document.querySelectorAll('.artcraft-nav-item[data-module-switch]').forEach((link) => {
			link.addEventListener('click', (event) => {
				event.preventDefault();
				const mod = link.getAttribute('data-module-switch');
				if (!mod || mod === activeModule) return;
				activeModule = mod;
				currentPage = 1;
				const href = link.getAttribute('href');
				if (href && window.history?.pushState) {
					window.history.pushState({ module: mod }, '', href);
				}
				applyModuleChrome(activeModule);
				fetchModuleFiles(activeModule);
			});
		});

		root.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;

			const pageTrigger = target.closest('[data-page]');
			if (pageTrigger && !pageTrigger.hasAttribute('disabled')) {
				event.preventDefault();
				const nextPage = Number(pageTrigger.getAttribute('data-page'));
				if (
					nextPage >= 1 &&
					nextPage <= paginationMeta.totalPages &&
					nextPage !== currentPage
				) {
					currentPage = nextPage;
					fetchModuleFiles(activeModule);
				}
				return;
			}

			const openTrigger = target.closest('[data-open-id]');
			if (openTrigger) {
				event.preventDefault();
				const id = openTrigger.getAttribute('data-open-id');
				if (id) {
					openFileFromList(id);
				}
			}
		});

		if (createBtn) {
			createBtn.addEventListener('click', handleCreateNewFile);
		}
		if (emptyCreateBtn) {
			emptyCreateBtn.addEventListener('click', handleCreateNewFile);
		}
		if (openLocalBtn && localFileInput) {
			openLocalBtn.addEventListener('click', () => {
				localFileInput.value = '';
				localFileInput.click();
			});
			localFileInput.addEventListener('change', () => {
				const file = localFileInput.files && localFileInput.files[0];
				if (!file) return;
				const detectedMod = window.OCA.Artcraft.detectModule(file.name, file.type);
				window.OCA.Artcraft.Editor.openAttachment({
					blob: file,
					fileName: file.name,
					mimeType: file.type,
					module: detectedMod || activeModule,
					targetDir: '/',
					onSaved: () => {
						fetchModuleFiles(activeModule);
					},
				});
			});
		}

		if (searchInput) {
			searchInput.addEventListener('input', () => {
				searchQuery = searchInput.value || '';
				currentPage = 1;
				if (searchDebounceTimer) {
					window.clearTimeout(searchDebounceTimer);
				}
				searchDebounceTimer = window.setTimeout(() => {
					fetchModuleFiles(activeModule);
				}, 200);
			});
		}
		if (sortSelect) {
			sortSelect.addEventListener('change', () => {
				sortBy = sortSelect.value || 'mtime';
				currentPage = 1;
				fetchModuleFiles(activeModule);
			});
		}
		if (perPageSelect) {
			perPageSelect.addEventListener('change', () => {
				perPage = Number(perPageSelect.value) || 20;
				currentPage = 1;
				fetchModuleFiles(activeModule);
			});
		}
		if (refreshBtn) {
			refreshBtn.addEventListener('click', () => {
				fetchModuleFiles(activeModule);
			});
		}

		// Initialize UI & fetch files
		applyModuleChrome(activeModule);
		fetchModuleFiles(activeModule);

		// Check if an initial fileId was passed via URL (?fileId=...)
		const initialFileId = Number(root.getAttribute('data-initial-file-id') || 0);
		if (initialFileId > 0) {
			window.OCA.Artcraft.Editor.openFileById({
				fileId: initialFileId,
				module: activeModule,
				onSaved: () => {
					fetchModuleFiles(activeModule);
				},
			});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initHub);
	} else {
		initHub();
	}
})(window, document);
