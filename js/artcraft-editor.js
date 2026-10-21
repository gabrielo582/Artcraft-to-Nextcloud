/**
 * ArtCraft Office - Fullscreen Modal Editor & Host Controller for Nextcloud
 *
 * Manages the lifecycle of the embedded WordCraft, GridCraft, and DeckCraft
 * WebAssembly iframes, file loading from Nextcloud storage or Mail/Talk attachments,
 * and saving/exporting back to Nextcloud.
 */
(function (window, document) {
	'use strict';

	window.OCA = window.OCA || {};
	window.OCA.Artcraft = window.OCA.Artcraft || {};

	const MODULE_META = {
		wordcraft: {
			id: 'wordcraft',
			label: 'WordCraft',
			subtitle: 'Processador de Textos',
			color: '#2B579A',
			defaultExt: 'docx',
			extensions: ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'odt', 'rtf'],
			mimes: [
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				'application/vnd.ms-word.document.macroEnabled.12',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
				'application/msword',
				'application/vnd.oasis.opendocument.text',
				'application/rtf',
				'text/rtf',
			],
		},
		gridcraft: {
			id: 'gridcraft',
			label: 'GridCraft',
			subtitle: 'Planilhas Eletrônicas',
			color: '#217346',
			defaultExt: 'xlsx',
			extensions: ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv'],
			mimes: [
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'application/vnd.ms-excel.sheet.macroEnabled.12',
				'application/vnd.ms-excel',
				'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
				'application/vnd.oasis.opendocument.spreadsheet',
				'text/csv',
				'text/tab-separated-values',
			],
		},
		deckcraft: {
			id: 'deckcraft',
			label: 'DeckCraft',
			subtitle: 'Apresentações de Slides',
			color: '#D24726',
			defaultExt: 'pptx',
			extensions: ['pptx', 'ppsx', 'potx', 'deckcraft'],
			mimes: [
				'application/vnd.openxmlformats-officedocument.presentationml.presentation',
				'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
				'application/vnd.openxmlformats-officedocument.presentationml.template',
				'application/vnd.ms-powerpoint',
				'application/vnd.oasis.opendocument.presentation',
			],
		},
	};

	function generateUrl(path) {
		if (window.OC && typeof window.OC.generateUrl === 'function') {
			return window.OC.generateUrl(path);
		}
		return '/index.php' + path;
	}

	function imagePath(iconName) {
		if (window.OC && typeof window.OC.imagePath === 'function') {
			return window.OC.imagePath('artcraft', iconName);
		}
		return '/custom_apps/artcraft/img/' + iconName;
	}

	function getRequestToken() {
		if (window.OC && window.OC.requestToken) {
			return window.OC.requestToken;
		}
		const head = document.querySelector('head[data-requesttoken]');
		return head ? head.getAttribute('data-requesttoken') || '' : '';
	}

	function getCurrentUserDisplayName() {
		if (window.OC && typeof window.OC.getCurrentUser === 'function') {
			const u = window.OC.getCurrentUser();
			if (u && (u.displayName || u.uid)) {
				return u.displayName || u.uid;
			}
		}
		const bodyUser = document.body?.getAttribute('data-user-displayname');
		return bodyUser || '';
	}

	function detectModule(fileName, mimeType) {
		const ext = ((fileName || '').split('.').pop() || '').toLowerCase();
		for (const mod of Object.values(MODULE_META)) {
			if (mod.extensions.includes(ext)) {
				return mod.id;
			}
		}
		const mime = (mimeType || '').toLowerCase();
		for (const mod of Object.values(MODULE_META)) {
			if (mod.mimes.includes(mime)) {
				return mod.id;
			}
		}
		if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) {
			return 'gridcraft';
		}
		if (mime.includes('presentation') || mime.includes('powerpoint')) {
			return 'deckcraft';
		}
		return 'wordcraft';
	}

	function showToast(message, isError) {
		if (window.OC && window.OC.Notification && typeof window.OC.Notification.showTemporary === 'function') {
			window.OC.Notification.showTemporary(message);
		}
		const toast = document.getElementById('artcraft-editor-toast');
		if (toast) {
			toast.textContent = message;
			toast.className = 'artcraft-editor-toast is-visible ' + (isError ? 'is-error' : 'is-success');
			clearTimeout(toast._hideTimer);
			toast._hideTimer = setTimeout(() => {
				toast.className = 'artcraft-editor-toast';
			}, 4000);
		}
	}

	/**
	 * Updates the Nextcloud Files directory listing in-place without reloading the page.
	 */
	function refreshNextcloudFilesList(createdFile, destinationFolder) {
		const bus = window._nc_event_bus || window.OC?._eventBus;
		if (bus && typeof bus.emit === 'function') {
			if (
				createdFile &&
				destinationFolder &&
				typeof destinationFolder.constructor === 'function' &&
				typeof destinationFolder.source === 'string'
			) {
				try {
					const cleanSource =
						destinationFolder.source.replace(/\/+$/, '') + '/' + createdFile.name;
					const node = new destinationFolder.constructor({
						source: cleanSource,
						id: Number(createdFile.id),
						type: 'file',
						mime: createdFile.mime || 'application/octet-stream',
						size: Number(createdFile.size) || 0,
						mtime: new Date(
							(Number(createdFile.mtime) || Math.floor(Date.now() / 1000)) * 1000
						),
						owner: destinationFolder.owner,
						permissions: destinationFolder.permissions || 31,
						root: destinationFolder.root,
						attributes: {
							...(destinationFolder.attributes || {}),
						},
					});
					bus.emit('files:node:created', node);
				} catch (err) {
					console.warn('[ArtCraft] Could not construct files:node:created payload:', err);
				}
			}

			try {
				bus.emit('files:config:updated');
			} catch (err) {
				console.warn('[ArtCraft] Failed to emit files:config:updated:', err);
			}
		}

		if (
			window.OCA?.Files?.App?.fileList &&
			typeof window.OCA.Files.App.fileList.reload === 'function'
		) {
			window.OCA.Files.App.fileList.reload();
		}
	}

	class ArtcraftEditorModal {
		constructor() {
			this.overlayEl = null;
			this.iframeEl = null;
			this.statusEl = null;
			this.titleEl = null;
			this.folderEl = null;
			this.saveAttachmentBtn = null;

			this.activeSession = null;
			this.boundOnMessage = this.onWindowMessage.bind(this);
			this.boundOnKeyDown = this.onWindowKeyDown.bind(this);
		}

		/**
		 * Opens a file stored in Nextcloud by its numeric `fileId`.
		 */
		async openFileById(options) {
			const fileId = Number(options.fileId);
			if (!fileId) {
				showToast('ID de arquivo inválido', true);
				return;
			}

			let fileName = options.fileName || '';
			let module = options.module || '';
			let folderPath = options.folderPath || '/';
			let writable = options.writable !== false;

			if (!fileName || !module) {
				try {
					const metaResp = await fetch(generateUrl(`/apps/artcraft/api/files/${fileId}/meta`), {
						headers: { requesttoken: getRequestToken() },
					});
					if (metaResp.ok) {
						const metaJson = await metaResp.json();
						if (metaJson.file) {
							fileName = metaJson.file.name || fileName;
							module = metaJson.file.module || module;
							folderPath = metaJson.file.folder || folderPath;
							writable = metaJson.file.writable !== false;
						}
					}
				} catch (err) {
					console.warn('[ArtCraft] Could not prefetch file meta:', err);
				}
			}

			if (!module) {
				module = detectModule(fileName, options.mimeType);
			}
			if (!fileName) {
				const meta = MODULE_META[module] || MODULE_META.wordcraft;
				fileName = `Documento.${meta.defaultExt}`;
			}

			this.mountModal({
				mode: 'nextcloud-file',
				fileId,
				fileName,
				folderPath,
				module,
				writable,
				onSaved: options.onSaved || null,
				onClosed: options.onClosed || null,
			});

			this.setStatus('loading', 'Carregando arquivo do Nextcloud…');

			try {
				const resp = await fetch(generateUrl(`/apps/artcraft/api/files/${fileId}/content`), {
					headers: { requesttoken: getRequestToken() },
				});
				if (!resp.ok) {
					throw new Error(`HTTP ${resp.status}`);
				}
				const buffer = await resp.arrayBuffer();
				if (this.activeSession && this.activeSession.fileId === fileId) {
					this.activeSession.pendingBuffer = buffer;
					this.activeSession.lastKnownBuffer = buffer.slice(0);
					this.tryDeliverPendingBuffer();
				}
			} catch (err) {
				console.error('[ArtCraft] Erro ao carregar conteúdo do arquivo:', err);
				this.setStatus('error', 'Erro ao baixar arquivo');
				showToast('Não foi possível abrir o arquivo do Nextcloud: ' + err.message, true);
			}
		}

		/**
		 * Opens an attachment directly (from Nextcloud Mail, Talk, Viewer, or local file)
		 * without requiring it to be pre-saved in Nextcloud Files first.
		 */
		async openAttachment(options) {
			const fileName = options.fileName || 'Anexo.docx';
			const module = options.module || detectModule(fileName, options.mimeType);
			const targetDir = options.targetDir || '/';

			this.mountModal({
				mode: 'attachment',
				fileId: null,
				fileName,
				folderPath: targetDir,
				module,
				writable: true,
				onSaved: options.onSaved || null,
				onClosed: options.onClosed || null,
			});

			this.setStatus('loading', 'Abrindo anexo…');

			try {
				let buffer = null;
				if (ArrayBuffer.isView(options.arrayBuffer)) {
					buffer = options.arrayBuffer.buffer.slice(
						options.arrayBuffer.byteOffset,
						options.arrayBuffer.byteOffset + options.arrayBuffer.byteLength
					);
				} else if (options.arrayBuffer && typeof options.arrayBuffer.byteLength === 'number') {
					buffer = options.arrayBuffer;
				} else if (options.blob instanceof Blob) {
					buffer = await options.blob.arrayBuffer();
				} else if (options.url) {
					const parsedUrl = new URL(options.url, window.location.origin);
					const isSameOrigin = parsedUrl.origin === window.location.origin;
					const isBlob = parsedUrl.protocol === 'blob:';
					if (!isSameOrigin && !isBlob) {
						throw new Error('URL de anexo externa não permitida');
					}
					const resp = await fetch(parsedUrl.toString(), {
						credentials: isSameOrigin ? 'same-origin' : 'omit',
						headers: isSameOrigin ? { requesttoken: getRequestToken() } : {},
					});
					if (!resp.ok) {
						throw new Error(`HTTP ${resp.status}`);
					}
					buffer = await resp.arrayBuffer();
				}

				if (!buffer) {
					throw new Error('Fonte de dados do anexo ausente');
				}

				if (this.activeSession) {
					this.activeSession.pendingBuffer = buffer;
					this.activeSession.lastKnownBuffer = buffer.slice(0);
					this.tryDeliverPendingBuffer();
				}
			} catch (err) {
				console.error('[ArtCraft] Erro ao abrir anexo:', err);
				this.setStatus('error', 'Erro ao ler anexo');
				showToast('Falha ao abrir anexo: ' + err.message, true);
			}
		}

		/**
		 * Creates a new blank file in Nextcloud Files and opens it immediately in the editor.
		 */
		async createAndOpenNewFile(options) {
			const module = (options.module || 'wordcraft').toLowerCase();
			const meta = MODULE_META[module] || MODULE_META.wordcraft;
			const dir = options.dir || '/';
			const defaultBase =
				module === 'gridcraft'
					? 'Nova Planilha.xlsx'
					: module === 'deckcraft'
						? 'Nova Apresentacao.pptx'
						: 'Novo Documento.docx';
			const name = options.fileName || defaultBase;

			try {
				const resp = await fetch(generateUrl('/apps/artcraft/api/files/create'), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						requesttoken: getRequestToken(),
					},
					body: JSON.stringify({
						module: meta.id,
						name,
						dir,
					}),
				});
				const data = await resp.json();
				if (!resp.ok || !data.file) {
					throw new Error(data.error || `HTTP ${resp.status}`);
				}
				refreshNextcloudFilesList(data.file, options.destinationFolder || null);
				await this.openFileById({
					fileId: data.file.id,
					fileName: data.file.name,
					folderPath: data.file.folder,
					module: data.file.module,
					writable: data.file.writable,
					onSaved: options.onSaved,
					onClosed: options.onClosed,
				});
				return data.file;
			} catch (err) {
				console.error('[ArtCraft] Erro ao criar arquivo:', err);
				showToast('Erro ao criar novo arquivo: ' + err.message, true);
				throw err;
			}
		}

		mountModal(sessionConfig) {
			this.close(true);

			const meta = MODULE_META[sessionConfig.module] || MODULE_META.wordcraft;
			const author = getCurrentUserDisplayName() || 'Nextcloud User';

			this.activeSession = {
				...sessionConfig,
				module: meta.id,
				wasmReady: false,
				pendingBuffer: null,
				lastKnownBuffer: null,
				fileDelivered: false,
				dirty: false,
				saving: false,
			};

			const overlay = document.createElement('div');
			overlay.id = 'artcraft-modal-overlay';
			overlay.className = 'artcraft-modal-overlay';
			overlay.setAttribute('role', 'dialog');
			overlay.setAttribute('aria-modal', 'true');
			overlay.setAttribute('aria-label', `${meta.label} - ${sessionConfig.fileName}`);

			const isAttachment = sessionConfig.mode === 'attachment' && !sessionConfig.fileId;

			overlay.innerHTML = `
				<header class="artcraft-modal-header" style="--artcraft-accent: ${meta.color}">
					<div class="artcraft-modal-brand">
						<img src="${imagePath(meta.id + '.svg')}" alt="${meta.label}" class="artcraft-modal-icon" />
						<span class="artcraft-modal-module-badge">${meta.label}</span>
					</div>
					<div class="artcraft-modal-fileinfo">
						<span class="artcraft-modal-filename" id="artcraft-modal-filename"></span>
						<span class="artcraft-modal-folder" id="artcraft-modal-folder"></span>
						<span class="artcraft-modal-status is-loading" id="artcraft-modal-status">Iniciando ${meta.label}…</span>
					</div>
					<div class="artcraft-modal-actions">
						<button type="button" class="artcraft-btn artcraft-btn-primary" id="artcraft-btn-save" title="Salvar no Nextcloud (Ctrl+S)">
							<span>${isAttachment ? 'Salvar Anexo no Nextcloud' : 'Salvar'}</span>
						</button>
						<button type="button" class="artcraft-btn artcraft-btn-secondary" id="artcraft-btn-download" title="Baixar cópia para o computador">
							<span>Baixar</span>
						</button>
						<button type="button" class="artcraft-btn artcraft-btn-close" id="artcraft-btn-close" title="Fechar editor (Esc)">
							<span aria-hidden="true">✕</span>
							<span class="artcraft-sr-only">Fechar</span>
						</button>
					</div>
				</header>
				<div class="artcraft-modal-body">
					<iframe
						id="artcraft-wasm-iframe"
						class="artcraft-wasm-iframe"
						title="${meta.label} Editor"
						allow="fullscreen; clipboard-read; clipboard-write"
						allowfullscreen
					></iframe>
					<div id="artcraft-editor-toast" class="artcraft-editor-toast"></div>
				</div>
			`;

			document.body.appendChild(overlay);
			document.body.classList.add('artcraft-modal-open');

			this.overlayEl = overlay;
			this.iframeEl = overlay.querySelector('#artcraft-wasm-iframe');
			this.statusEl = overlay.querySelector('#artcraft-modal-status');
			this.titleEl = overlay.querySelector('#artcraft-modal-filename');
			this.folderEl = overlay.querySelector('#artcraft-modal-folder');
			this.saveAttachmentBtn = overlay.querySelector('#artcraft-btn-save');

			this.updateHeaderFileInfo();

			const saveBtn = overlay.querySelector('#artcraft-btn-save');
			saveBtn.addEventListener('mousedown', (e) => {
				// Prevent clicking "Salvar" from stealing focus from the WASM iframe
				e.preventDefault();
			});
			saveBtn.addEventListener('click', () => {
				this.requestSaveFromToolbar();
			});

			overlay.querySelector('#artcraft-btn-download').addEventListener('click', () => {
				this.downloadCurrentFile();
			});

			overlay.querySelector('#artcraft-btn-close').addEventListener('click', () => {
				this.close(false);
			});

			window.addEventListener('message', this.boundOnMessage);
			window.addEventListener('keydown', this.boundOnKeyDown);

			// Build iframe URL pointing to WasmController
			const queryParams = new URLSearchParams({
				host: 'parent',
				module: meta.id,
				author,
				filename: sessionConfig.fileName,
			});
			// DeckCraft uses ?blank to skip loading the built-in sample presentation
			let wasmUrl = generateUrl(`/apps/artcraft/wasm/${meta.id}/index.html`) + '?' + queryParams.toString();
			if (meta.id === 'deckcraft') {
				wasmUrl += '&blank';
			}
			this.iframeEl.src = wasmUrl;
		}

		updateHeaderFileInfo() {
			if (!this.activeSession) return;
			if (this.titleEl) {
				this.titleEl.textContent = this.activeSession.fileName;
			}
			if (this.folderEl) {
				this.folderEl.textContent = this.activeSession.fileId
					? `(${this.activeSession.folderPath || '/'})`
					: '(Anexo externo — clique em Salvar para gravar no Nextcloud)';
			}
			if (this.saveAttachmentBtn) {
				const span = this.saveAttachmentBtn.querySelector('span');
				if (span) {
					span.textContent = this.activeSession.fileId ? 'Salvar' : 'Salvar Anexo no Nextcloud';
				}
			}
		}

		setStatus(state, text) {
			if (!this.statusEl) return;
			this.statusEl.className = `artcraft-modal-status is-${state}`;
			this.statusEl.textContent = text;
		}

		tryDeliverPendingBuffer() {
			const s = this.activeSession;
			if (!s || !s.wasmReady || !s.pendingBuffer || s.fileDelivered) {
				return;
			}
			if (!this.iframeEl || !this.iframeEl.contentWindow) {
				return;
			}

			s.fileDelivered = true;
			const bufferToSend = s.pendingBuffer;
			s.pendingBuffer = null;

			this.iframeEl.contentWindow.postMessage(
				{
					type: `${s.module}:open`,
					name: s.fileName,
					bytes: bufferToSend,
				},
				window.location.origin,
				[bufferToSend]
			);

			this.setStatus(
				s.fileId ? 'saved' : 'unsaved',
				s.fileId ? '✓ Pronto' : '● Anexo aberto (não salvo no Files)'
			);
			this.iframeEl.focus();
		}

		onWindowMessage(event) {
			const s = this.activeSession;
			if (!s || !this.iframeEl || event.source !== this.iframeEl.contentWindow) {
				return;
			}
			if (event.origin !== window.location.origin) {
				return;
			}

			const data = event.data;
			if (!data || typeof data.type !== 'string') {
				return;
			}

			const prefix = `${s.module}:`;
			if (!data.type.startsWith(prefix)) {
				return;
			}
			const action = data.type.slice(prefix.length);

			if (action === 'ready') {
				s.wasmReady = true;
				this.tryDeliverPendingBuffer();
			} else if (action === 'dirty') {
				s.dirty = Boolean(data.dirty);
				if (!s.saving) {
					if (s.dirty) {
						this.setStatus('unsaved', '● Alterações não salvas');
					} else {
						this.setStatus('saved', '✓ Salvo no Nextcloud');
					}
				}
			} else if (action === 'save') {
				this.handleWasmSave(data.name || s.fileName, data.bytes, data.saveId);
			} else if (action === 'failed') {
				this.setStatus('error', 'Falha ao iniciar WebAssembly');
				showToast(`Erro ao iniciar ${s.module}: ${data.error || 'WebGPU/WebGL2 indisponível'}`, true);
			}
		}

		async handleWasmSave(savedName, bytesBuffer, saveId) {
			const s = this.activeSession;
			if (!s || !bytesBuffer) {
				return;
			}

			s.saving = true;
			this.setStatus('saving', 'Salvando no Nextcloud…');

			const rawBytes = ArrayBuffer.isView(bytesBuffer)
				? bytesBuffer.buffer.slice(bytesBuffer.byteOffset, bytesBuffer.byteOffset + bytesBuffer.byteLength)
				: bytesBuffer;
			s.lastKnownBuffer = rawBytes.slice(0);

			try {
				let resp;
				if (s.fileId) {
					const url =
						generateUrl(`/apps/artcraft/api/files/${s.fileId}/save`) +
						'?name=' +
						encodeURIComponent(savedName || s.fileName);
					resp = await fetch(url, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/octet-stream',
							requesttoken: getRequestToken(),
						},
						body: rawBytes,
					});
				} else {
					const url =
						generateUrl('/apps/artcraft/api/files/save-attachment') +
						'?name=' +
						encodeURIComponent(savedName || s.fileName) +
						'&dir=' +
						encodeURIComponent(s.folderPath || '/');
					resp = await fetch(url, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/octet-stream',
							requesttoken: getRequestToken(),
						},
						body: rawBytes,
					});
				}

				const result = await resp.json();
				if (!resp.ok || result.status !== 'ok') {
					throw new Error(result.error || `HTTP ${resp.status}`);
				}

				s.saving = false;
				s.dirty = false;

				if (result.mode === 'created' && result.file) {
					s.fileId = result.file.id;
					s.fileName = result.file.name;
					s.folderPath = result.file.folder;
					this.updateHeaderFileInfo();
					showToast(`Anexo salvo no Nextcloud em ${result.file.path}`);
				} else if (result.mode === 'exported' && result.file) {
					showToast(`Arquivo exportado no Nextcloud: ${result.file.path}`);
				} else {
					showToast(`Salvo no Nextcloud: ${result.file?.name || s.fileName}`);
				}

				this.setStatus('saved', '✓ Salvo no Nextcloud');

				if (saveId && this.iframeEl && this.iframeEl.contentWindow) {
					this.iframeEl.contentWindow.postMessage(
						{
							type: `${s.module}:saved`,
							saveId,
							ok: true,
						},
						window.location.origin
					);
				}

				if (typeof s.onSaved === 'function') {
					try {
						s.onSaved(result.file, result.mode);
					} catch (cbErr) {
						console.warn('[ArtCraft] onSaved callback error:', cbErr);
					}
				}

				// Refresh Nextcloud Files list in-place if open underneath
				refreshNextcloudFilesList();
			} catch (err) {
				console.error('[ArtCraft] Erro ao salvar no Nextcloud:', err);
				s.saving = false;
				this.setStatus('error', 'Erro ao salvar');
				showToast('Falha ao salvar no Nextcloud: ' + err.message, true);

				if (saveId && this.iframeEl && this.iframeEl.contentWindow) {
					this.iframeEl.contentWindow.postMessage(
						{
							type: `${s.module}:saved`,
							saveId,
							ok: false,
							error: err.message,
						},
						window.location.origin
					);
				}
			}
		}

		requestSaveFromToolbar() {
			const s = this.activeSession;
			if (!s) return;

			// If this is an unmodified external attachment that hasn't been saved to Nextcloud Files yet,
			// we can save its buffer directly to Nextcloud Files right away!
			if (!s.fileId && !s.dirty && s.lastKnownBuffer) {
				this.handleWasmSave(s.fileName, s.lastKnownBuffer, null);
				return;
			}

			if (this.iframeEl && this.iframeEl.contentWindow) {
				this.iframeEl.focus();
				this.iframeEl.contentWindow.postMessage(
					{
						type: `${s.module}:request-save`,
					},
					window.location.origin
				);

				// Fallback: if Backstage ("Arquivo" menu) or a dialog was open in GridCraft,
				// close it with Escape and re-send Ctrl+S after 250ms if saving hasn't started yet.
				window.setTimeout(() => {
					if (
						this.activeSession === s &&
						!s.saving &&
						this.iframeEl &&
						this.iframeEl.contentWindow
					) {
						this.iframeEl.contentWindow.postMessage(
							{
								type: `${s.module}:request-save`,
								closeBackstageFirst: true,
							},
							window.location.origin
						);
					}
				}, 250);
			}
		}

		downloadCurrentFile() {
			const s = this.activeSession;
			if (!s) return;
			if (s.fileId) {
				const link = document.createElement('a');
				link.href = generateUrl(`/apps/artcraft/api/files/${s.fileId}/content`);
				link.download = s.fileName;
				document.body.appendChild(link);
				link.click();
				link.remove();
			} else if (s.lastKnownBuffer) {
				const blob = new Blob([s.lastKnownBuffer], { type: 'application/octet-stream' });
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = s.fileName;
				document.body.appendChild(link);
				link.click();
				link.remove();
				setTimeout(() => URL.revokeObjectURL(url), 5000);
			}
		}

		onWindowKeyDown(event) {
			if (!this.activeSession) return;
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
				event.preventDefault();
				this.requestSaveFromToolbar();
			}
		}

		close(force) {
			if (!this.activeSession && !this.overlayEl) {
				return;
			}
			if (!force && this.activeSession && this.activeSession.dirty) {
				const confirmed = window.confirm(
					'Existem alterações não salvas neste documento. Deseja realmente fechar sem salvar?'
				);
				if (!confirmed) {
					return;
				}
			}

			const onClosed = this.activeSession?.onClosed;
			window.removeEventListener('message', this.boundOnMessage);
			window.removeEventListener('keydown', this.boundOnKeyDown);

			if (this.overlayEl) {
				this.overlayEl.remove();
				this.overlayEl = null;
			}
			this.iframeEl = null;
			this.statusEl = null;
			this.titleEl = null;
			this.folderEl = null;
			this.saveAttachmentBtn = null;
			this.activeSession = null;
			document.body.classList.remove('artcraft-modal-open');

			if (typeof onClosed === 'function') {
				try {
					onClosed();
				} catch (_) {
					// Ignore
				}
			}
		}
	}

	const editorInstance = new ArtcraftEditorModal();

	window.OCA.Artcraft.MODULE_META = MODULE_META;
	window.OCA.Artcraft.detectModule = detectModule;
	window.OCA.Artcraft.generateUrl = generateUrl;
	window.OCA.Artcraft.imagePath = imagePath;
	window.OCA.Artcraft.getRequestToken = getRequestToken;
	window.OCA.Artcraft.Editor = editorInstance;
})(window, document);
