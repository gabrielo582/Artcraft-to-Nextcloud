/**
 * ArtCraft Office - Nextcloud Files, "+ Novo" Menu & Direct Attachment Integration
 *
 * Hooks into:
 * 1. Nextcloud Files (both legacy OCA.Files.fileActions and Nextcloud 28-32+ Vue Files table)
 * 2. Nextcloud "+ Novo" / Upload Picker menu (creating .docx, .xlsx, .pptx in the current folder)
 * 3. Nextcloud Viewer / Mail / Talk attachments (opening Office attachments directly in ArtCraft)
 */
(function (window, document) {
	'use strict';

	const ALL_SUPPORTED_EXTENSIONS = new Set([
		'docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'odt', 'rtf',
		'xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv',
		'pptx', 'ppsx', 'potx', 'deckcraft',
	]);

	function getEditor() {
		return window.OCA?.Artcraft?.Editor || null;
	}

	function getModuleMeta() {
		return window.OCA?.Artcraft?.MODULE_META || {};
	}

	function detectModule(fileName, mimeType) {
		if (window.OCA?.Artcraft?.detectModule) {
			return window.OCA.Artcraft.detectModule(fileName, mimeType);
		}
		return 'wordcraft';
	}

	function getExtension(name) {
		const parts = (name || '').toLowerCase().trim().split('.');
		return parts.length > 1 ? parts.pop() : '';
	}

	function isSupportedFile(fileName, mimeType) {
		const ext = getExtension(fileName);
		if (ALL_SUPPORTED_EXTENSIONS.has(ext)) {
			return true;
		}
		const mime = (mimeType || '').toLowerCase();
		const meta = getModuleMeta();
		for (const mod of Object.values(meta)) {
			if (mod.mimes && mod.mimes.includes(mime)) {
				return true;
			}
		}
		return false;
	}

	function getCurrentFilesDirectory() {
		const params = new URLSearchParams(window.location.search);
		const dir = params.get('dir');
		if (dir) {
			return dir;
		}
		if (window.OCA?.Files?.App?.fileList?.getCurrentDirectory) {
			return window.OCA.Files.App.fileList.getCurrentDirectory() || '/';
		}
		return '/';
	}

	const NEW_FILE_ENTRIES = [
		{
			id: 'artcraft-new-docx',
			displayName: 'Criar documento',
			templateName: 'Novo Documento.docx',
			module: 'wordcraft',
			order: 15,
			iconClass: 'icon-filetype-document',
			iconSvgInline:
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M6 2C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6Z" fill="#2B579A"/><path d="M14 2V8H20L14 2Z" fill="#729FCF"/><path d="M7.2 11.5L9.0 18H10.6L12.0 13.5L13.4 18H15.0L16.8 11.5H15.2L14.1 15.9L12.7 11.5H11.3L9.9 15.9L8.8 11.5H7.2Z" fill="#FFFFFF"/></svg>',
		},
		{
			id: 'artcraft-new-xlsx',
			displayName: 'Criar Planilha',
			templateName: 'Nova Planilha.xlsx',
			module: 'gridcraft',
			order: 16,
			iconClass: 'icon-filetype-spreadsheet',
			iconSvgInline:
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M6 2C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6Z" fill="#217346"/><path d="M14 2V8H20L14 2Z" fill="#68B88E"/><rect x="7" y="10.5" width="4.2" height="3.2" rx="0.5" fill="#FFFFFF"/><rect x="12.8" y="10.5" width="4.2" height="3.2" rx="0.5" fill="#FFFFFF" fill-opacity="0.85"/><rect x="7" y="15.2" width="4.2" height="3.2" rx="0.5" fill="#FFFFFF" fill-opacity="0.85"/><rect x="12.8" y="15.2" width="4.2" height="3.2" rx="0.5" fill="#FFFFFF"/></svg>',
		},
		{
			id: 'artcraft-new-pptx',
			displayName: 'Criar apresentação',
			templateName: 'Nova Apresentacao.pptx',
			module: 'deckcraft',
			order: 17,
			iconClass: 'icon-filetype-presentation',
			iconSvgInline:
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M6 2C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6Z" fill="#D24726"/><path d="M14 2V8H20L14 2Z" fill="#F29B86"/><rect x="7" y="10.5" width="10" height="7.5" rx="1" stroke="#FFFFFF" stroke-width="1.6"/><path d="M10.5 12.5L14 14.25L10.5 16V12.5Z" fill="#FFFFFF"/></svg>',
		},
	];

	let uploadPickerRefreshed = false;

	/**
	 * Registers "Criar documento", "Criar Planilha", and "Criar apresentação" inside
	 * Nextcloud 28–32+ `window._nc_newfilemenu` ("+ Novo" dropdown -> "Criar novo" section).
	 */
	function ensureModernNewFileMenuRegistered() {
		const menu = window._nc_newfilemenu;
		if (!menu || typeof menu.registerEntry !== 'function') {
			return;
		}

		let addedAny = false;
		for (const item of NEW_FILE_ENTRIES) {
			const exists =
				typeof menu.getEntryIndex === 'function'
					? menu.getEntryIndex(item.id) !== -1
					: Array.isArray(menu._entries) && menu._entries.some((e) => e.id === item.id);
			if (exists) {
				continue;
			}
			try {
				menu.registerEntry({
					id: item.id,
					displayName: item.displayName,
					iconSvgInline: item.iconSvgInline,
					category: 1, // Category 1 === CreateNew ("Criar novo")
					order: item.order,
					enabled: (folder) => {
						// PERMISSION_CREATE === 4
						if (folder && typeof folder.permissions === 'number') {
							return (folder.permissions & 4) !== 0;
						}
						return true;
					},
					handler: (destination) => {
						const dir = destination?.path || getCurrentFilesDirectory();
						const entered = window.prompt('Nome do novo arquivo:', item.templateName);
						if (entered === null) {
							return;
						}
						const finalName = entered.trim() || item.templateName;
						getEditor()?.createAndOpenNewFile({
							module: item.module,
							fileName: finalName,
							dir,
							destinationFolder: destination || null,
						});
					},
				});
				addedAny = true;
			} catch (err) {
				console.warn('[ArtCraft] Failed to register NewFileMenu entry:', err);
			}
		}

		if (addedAny || !uploadPickerRefreshed) {
			const pickerEl = document.querySelector('[data-cy-upload-picker]');
			const vm = pickerEl && pickerEl.__vue__;
			if (vm && vm.destination && typeof vm.setDestination === 'function') {
				try {
					vm.setDestination(vm.destination);
					uploadPickerRefreshed = true;
				} catch (_) {
					// Ignore
				}
			}
		}
	}

	/**
	 * 1. Register with OCA.Files.fileActions & OCA.Files.NewFileMenu when available
	 */
	function registerLegacyFilesIntegration() {
		const fileActions = window.OCA?.Files?.fileActions;
		const metaMap = getModuleMeta();
		if (fileActions && typeof fileActions.registerAction === 'function') {
			for (const mod of Object.values(metaMap)) {
				for (const mime of mod.mimes) {
					const actionName = `artcraft_open_${mod.id}_${mime}`;
					fileActions.registerAction({
						name: actionName,
						displayName: `Abrir no ${mod.label}`,
						mime,
						permissions: window.OC?.PERMISSION_READ || 1,
						iconClass: `icon-artcraft-${mod.id}`,
						actionHandler: (fileName, context) => {
							const fileId =
								context?.$file?.attr('data-id') ||
								context?.fileInfoModel?.id ||
								context?.fileId;
							const dir = context?.dir || getCurrentFilesDirectory();
							if (fileId) {
								getEditor()?.openFileById({
									fileId: Number(fileId),
									fileName,
									folderPath: dir,
									module: mod.id,
								});
							}
						},
					});
					fileActions.setDefault(mime, actionName);
				}
			}
		}

		if (window.OCA?.Files?.NewFileMenu && typeof window.OCA.Files.NewFileMenu.registerMenuEntry === 'function') {
			for (const item of NEW_FILE_ENTRIES) {
				window.OCA.Files.NewFileMenu.registerMenuEntry({
					id: item.id,
					displayName: item.displayName,
					templateName: item.templateName,
					iconClass: item.iconClass,
					actionHandler: () => {
						const dir = getCurrentFilesDirectory();
						getEditor()?.createAndOpenNewFile({
							module: item.module,
							fileName: item.templateName,
							dir,
						});
					},
				});
			}
		}
	}

	/**
	 * 2. Register with Nextcloud 28-32+ Vue Files table & Upload Picker ("+ Novo")
	 */
	function setupModernFilesObserver() {
		// Intercept clicks on supported Office file rows in Nextcloud 28+ Vue Files app
		document.addEventListener(
			'click',
			(event) => {
				const target = event.target;
				if (!(target instanceof Element)) {
					return;
				}
				// Ignore clicks on selection checkboxes, three-dot action triggers, or favorite stars
				if (
					target.closest(
						'.files-list__row-checkbox, .files-list__row-actions, .action-menu, button.action-item__menutoggle, input[type="checkbox"]'
					)
				) {
					return;
				}

				const row = target.closest(
					'tr[data-cy-files-list-row], tr[data-id][data-file], tr.files-list__row'
				);
				if (!row) {
					return;
				}

				const fileName =
					row.getAttribute('data-cy-files-list-row-name') ||
					row.getAttribute('data-file') ||
					row.querySelector('.files-list__row-name-, .nametext, [data-cy-files-list-row-name]')?.textContent?.trim() ||
					'';
				if (!fileName || !isSupportedFile(fileName, row.getAttribute('data-mime'))) {
					return;
				}

				const fileId =
					row.getAttribute('data-cy-files-list-row-fileid') ||
					row.getAttribute('data-id') ||
					row.dataset?.id ||
					row.dataset?.fileid;
				if (!fileId) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();

				const mod = detectModule(fileName, row.getAttribute('data-mime'));
				getEditor()?.openFileById({
					fileId: Number(fileId),
					fileName,
					folderPath: getCurrentFilesDirectory(),
					module: mod,
				});
			},
			true
		);

		const observer = new MutationObserver(() => {
			ensureModernNewFileMenuRegistered();
			enhanceAttachmentsInDOM();
		});
		if (document.body) {
			observer.observe(document.body, { childList: true, subtree: true });
			ensureModernNewFileMenuRegistered();
			enhanceAttachmentsInDOM();
		}
	}

	/**
	 * 3. Direct Attachment Opener for Nextcloud Mail, Nextcloud Talk, and Download Links
	 */
	function enhanceAttachmentsInDOM() {
		// Look for attachment links or cards in Nextcloud Mail / Talk / Collectives
		const candidateLinks = document.querySelectorAll(
			'a[href*="attachment"], a[href*="/dav/"], a[download], .mail-attachment, [data-cy-attachment]'
		);

		candidateLinks.forEach((el) => {
			if (el.getAttribute('data-artcraft-bound') === '1') {
				return;
			}

			const fileName =
				el.getAttribute('download') ||
				el.getAttribute('title') ||
				el.getAttribute('data-filename') ||
				el.textContent?.trim() ||
				'';
			if (!fileName || !isSupportedFile(fileName, el.getAttribute('data-mimetype'))) {
				return;
			}

			el.setAttribute('data-artcraft-bound', '1');
			const mod = detectModule(fileName, el.getAttribute('data-mimetype'));
			const modMeta = getModuleMeta()[mod] || { label: 'ArtCraft', color: '#2B579A' };

			// If it is a direct anchor with a same-origin or blob URL, add an inline "Abrir no <Module>" button next to it
			const href = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href');
			if (!href) {
				return;
			}
			let safeHref = '';
			try {
				const parsed = new URL(href, window.location.origin);
				if (parsed.origin === window.location.origin || parsed.protocol === 'blob:') {
					safeHref = parsed.toString();
				}
			} catch (_) {
				return;
			}
			if (!safeHref) {
				return;
			}

			const openBtn = document.createElement('button');
			openBtn.type = 'button';
			openBtn.className = 'artcraft-attachment-open-btn';
			openBtn.style.setProperty('--artcraft-accent', modMeta.color);
			openBtn.title = `Abrir anexo direto no ${modMeta.label}`;
			openBtn.innerHTML = `<img src="${window.OCA.Artcraft.imagePath(mod + '.svg')}" alt="" /><span>Abrir no ${modMeta.label}</span>`;

			openBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				getEditor()?.openAttachment({
					url: safeHref,
					fileName,
					module: mod,
				});
			});

			if (el.parentElement) {
				el.parentElement.insertBefore(openBtn, el.nextSibling);
			}
		});
	}

	// Expose helper globally so any Nextcloud extension or custom trigger can open an attachment directly
	window.OCA = window.OCA || {};
	window.OCA.Artcraft = window.OCA.Artcraft || {};
	window.OCA.Artcraft.openAttachment = function (options) {
		return getEditor()?.openAttachment(options);
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			registerLegacyFilesIntegration();
			setupModernFilesObserver();
		});
	} else {
		registerLegacyFilesIntegration();
		setupModernFilesObserver();
	}
})(window, document);
