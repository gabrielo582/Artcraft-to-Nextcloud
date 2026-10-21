/**
 * ArtCraft Host Bridge for Nextcloud (?host=parent)
 *
 * Unifies the postMessage protocol across WordCraft, GridCraft, and DeckCraft
 * when embedded inside a same-origin Nextcloud iframe:
 *
 * Messages sent to window.parent:
 * - `{ type: "<module>:ready", version }`
 * - `{ type: "<module>:save", name, bytes, saveId }` (bytes is an ArrayBuffer)
 * - `{ type: "<module>:dirty", dirty }`
 * - `{ type: "<module>:failed", error }`
 *
 * Messages received from window.parent:
 * - `{ type: "<module>:open", name, bytes }` (bytes is an ArrayBuffer or Uint8Array)
 * - `{ type: "<module>:saved", saveId, ok, error }`
 * - `{ type: "<module>:request-save" }`
 */
(function () {
	'use strict';

	const params = new URLSearchParams(window.location.search);
	if (params.get('host') !== 'parent') {
		return;
	}
	if (!window.parent || window.parent === window) {
		return;
	}

	const origin = window.location.origin;
	const scriptEl = document.currentScript;
	const moduleName = (
		scriptEl?.dataset?.module ||
		params.get('module') ||
		detectModuleFromPath()
	).toLowerCase();
	const moduleVersion = scriptEl?.dataset?.version || '0.8.0';

	// GridCraft v0.9.0+ already implements `apps/gridcraft-web/src/host.rs` natively in WASM
	// for `gridcraft:ready`, `gridcraft:open`, `gridcraft:save`, `gridcraft:dirty`, `gridcraft:failed`.
	// For GridCraft we only add support for `gridcraft:request-save` (synthetic Ctrl+S from Nextcloud toolbar).
	const hasNativeHostBridge = moduleName === 'gridcraft';

	let currentFileName = params.get('filename') || defaultFileName(moduleName);
	let lastReportedDirty = null;
	let wasmBeforeUnloadCheck = null;
	let saveCounter = 0;
	let lastFocusedTag = 'CANVAS';
	const pendingSaveResolvers = new Map();
	const blobUrlRegistry = new Map();

	document.addEventListener(
		'focusin',
		(e) => {
			if (e.target && e.target.tagName) {
				lastFocusedTag = e.target.tagName.toUpperCase();
			}
		},
		true
	);

	function detectModuleFromPath() {
		const path = window.location.pathname.toLowerCase();
		if (path.includes('gridcraft')) return 'gridcraft';
		if (path.includes('deckcraft')) return 'deckcraft';
		return 'wordcraft';
	}

	function defaultFileName(mod) {
		if (mod === 'gridcraft') return 'Planilha.xlsx';
		if (mod === 'deckcraft') return 'Apresentacao.pptx';
		return 'Documento.docx';
	}

	function mimeForName(name) {
		const ext = (name.split('.').pop() || '').toLowerCase();
		const map = {
			docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			doc: 'application/msword',
			odt: 'application/vnd.oasis.opendocument.text',
			rtf: 'application/rtf',
			xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			xls: 'application/vnd.ms-excel',
			ods: 'application/vnd.oasis.opendocument.spreadsheet',
			csv: 'text/csv',
			tsv: 'text/tab-separated-values',
			pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
			potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
			deckcraft: 'application/json',
			pdf: 'application/pdf',
			txt: 'text/plain',
			md: 'text/markdown',
			html: 'text/html',
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
		};
		return map[ext] || 'application/octet-stream';
	}

	function postToParent(payload, transfer) {
		try {
			if (transfer && transfer.length > 0) {
				window.parent.postMessage(payload, origin, transfer);
			} else {
				window.parent.postMessage(payload, origin);
			}
		} catch (err) {
			console.error(`[${moduleName}-bridge] Failed to postMessage to parent:`, err);
		}
	}

	/**
	 * Resolves the filename when the WASM app saves/downloads a file.
	 * If the app suggests a generic default like "document.docx" or "Presentation.deckcraft"
	 * while we have a specific `currentFileName` opened from Nextcloud, preserve the base name.
	 */
	function resolveSaveName(suggestedName) {
		const raw = (suggestedName || '').trim().split(/[/\\]/).pop() || '';
		if (!raw) {
			return currentFileName;
		}
		const suggestedExt = raw.includes('.') ? raw.split('.').pop().toLowerCase() : '';
		const currentExt = currentFileName.includes('.')
			? currentFileName.split('.').pop().toLowerCase()
			: '';
		const currentStem = currentFileName.replace(/\.[^.]+$/, '');

		const isGenericStem = /^(document|documento|untitled|sem titulo|presentation|apresentacao|deckcraft|book|workbook)$/i.test(
			raw.replace(/\.[^.]+$/, '')
		);

		if (suggestedExt && suggestedExt === currentExt && isGenericStem) {
			return currentFileName;
		}
		if (suggestedExt && suggestedExt !== currentExt && isGenericStem && currentStem) {
			return `${currentStem}.${suggestedExt}`;
		}
		return raw;
	}

	/**
	 * Sends saved bytes to Nextcloud parent and awaits confirmation.
	 */
	function sendSaveToNextcloud(name, arrayBuffer) {
		const saveId = ++saveCounter;
		const finalName = resolveSaveName(name);
		return new Promise((resolve, reject) => {
			const timer = window.setTimeout(() => {
				if (pendingSaveResolvers.has(saveId)) {
					pendingSaveResolvers.delete(saveId);
					resolve();
				}
			}, 15000);

			pendingSaveResolvers.set(saveId, {
				resolve: () => {
					window.clearTimeout(timer);
					reportDirty(false);
					resolve();
				},
				reject: (err) => {
					window.clearTimeout(timer);
					reject(new Error(err || 'Falha ao salvar no Nextcloud'));
				},
			});

			postToParent(
				{
					type: `${moduleName}:save`,
					name: finalName,
					bytes: arrayBuffer,
					saveId,
				},
				[arrayBuffer]
			);
		});
	}

	function reportDirty(dirty) {
		const normalized = Boolean(dirty);
		if (lastReportedDirty !== normalized) {
			lastReportedDirty = normalized;
			postToParent({
				type: `${moduleName}:dirty`,
				dirty: normalized,
			});
		}
	}

	/**
	 * Dispatches a synthetic file drop onto the eframe canvas so WordCraft/DeckCraft
	 * reads the bytes through `raw.dropped_files` -> `Services::inbox`.
	 */
	function injectFileIntoCanvas(name, bytesBuffer) {
		const canvasId = `${moduleName}_canvas`;
		const canvas = document.getElementById(canvasId) || document.querySelector('canvas');
		if (!canvas) {
			console.error(`[${moduleName}-bridge] Canvas #${canvasId} not found`);
			return;
		}

		currentFileName = name || currentFileName;
		const u8 = ArrayBuffer.isView(bytesBuffer)
			? new Uint8Array(bytesBuffer.buffer, bytesBuffer.byteOffset, bytesBuffer.byteLength)
			: new Uint8Array(bytesBuffer);
		const file = new File([u8], currentFileName, {
			type: mimeForName(currentFileName),
			lastModified: Date.now(),
		});

		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(file);

		for (const eventType of ['dragenter', 'dragover', 'drop']) {
			const dragEvent = new DragEvent(eventType, {
				bubbles: true,
				cancelable: true,
				 composed: true,
				dataTransfer,
			});
			canvas.dispatchEvent(dragEvent);
		}
	}

	/**
	 * Ensures the eframe canvas has focus and `runner.input.raw.focused` is true.
	 */
	function ensureCanvasFocused(canvas) {
		try {
			window.focus();
		} catch (_) {
			// Ignore
		}
		if (!canvas) {
			return;
		}
		canvas.focus();
		canvas.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
	}

	/**
	 * Dispatches a key press + delayed key release directly on the eframe canvas.
	 */
	function dispatchCanvasKey(canvas, keyOpts) {
		if (!canvas) {
			return;
		}
		ensureCanvasFocused(canvas);

		const keydownEvt = new KeyboardEvent('keydown', {
			key: keyOpts.key,
			code: keyOpts.code,
			keyCode: keyOpts.keyCode,
			which: keyOpts.keyCode,
			ctrlKey: Boolean(keyOpts.ctrlKey),
			metaKey: false,
			shiftKey: false,
			altKey: false,
			bubbles: true,
			cancelable: true,
			composed: true,
		});
		canvas.dispatchEvent(keydownEvt);

		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				const keyupEvt = new KeyboardEvent('keyup', {
					key: keyOpts.key,
					code: keyOpts.code,
					keyCode: keyOpts.keyCode,
					which: keyOpts.keyCode,
					ctrlKey: false,
					metaKey: false,
					shiftKey: false,
					altKey: false,
					bubbles: true,
					cancelable: true,
					composed: true,
				});
				canvas.dispatchEvent(keyupEvt);
			});
		});
	}

	/**
	 * Dispatches synthetic Ctrl+S into the eframe canvas when triggered from the Nextcloud header button.
	 * Handles active cell editing (<input> text_agent in GridCraft) and open Backstage/dialogs.
	 */
	function triggerSyntheticSaveShortcut(closeBackstageFirst) {
		const canvas = document.getElementById(`${moduleName}_canvas`) || document.querySelector('canvas');
		if (!canvas) {
			return;
		}

		const sendCtrlS = () => {
			dispatchCanvasKey(canvas, {
				key: 's',
				code: 'KeyS',
				keyCode: 83,
				ctrlKey: true,
			});
		};

		if (closeBackstageFirst) {
			dispatchCanvasKey(canvas, {
				key: 'Escape',
				code: 'Escape',
				keyCode: 27,
				ctrlKey: false,
			});
			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					sendCtrlS();
				});
			});
			return;
		}

		// In GridCraft, if a cell or formula bar is actively being edited (`text_agent` <input> has focus),
		// `grid::keyboard` ignores Ctrl+S while `app.editor.is_some()`. Commit the edit with Enter first.
		const activeEl = document.activeElement;
		const isInputActive =
			(activeEl && activeEl.tagName && activeEl.tagName.toUpperCase() === 'INPUT') ||
			lastFocusedTag === 'INPUT';

		if (moduleName === 'gridcraft' && isInputActive) {
			const inputEl =
				(activeEl && activeEl.tagName && activeEl.tagName.toUpperCase() === 'INPUT' ? activeEl : null) ||
				document.querySelector('input[type="text"]') ||
				document.querySelector('input');

			if (inputEl) {
				try {
					window.focus();
				} catch (_) {
					// Ignore
				}
				inputEl.focus();
				inputEl.dispatchEvent(new FocusEvent('focus', { bubbles: false }));

				const enterDown = new KeyboardEvent('keydown', {
					key: 'Enter',
					code: 'Enter',
					keyCode: 13,
					which: 13,
					bubbles: true,
					cancelable: true,
					composed: true,
				});
				inputEl.dispatchEvent(enterDown);

				window.requestAnimationFrame(() => {
					const enterUp = new KeyboardEvent('keyup', {
						key: 'Enter',
						code: 'Enter',
						keyCode: 13,
						which: 13,
						bubbles: true,
						cancelable: true,
						composed: true,
					});
					inputEl.dispatchEvent(enterUp);
					lastFocusedTag = 'CANVAS';

					window.requestAnimationFrame(() => {
						sendCtrlS();
					});
				});
				return;
			}
		}

		sendCtrlS();
	}

	if (!hasNativeHostBridge) {
		// 1. Intercept window.addEventListener('beforeunload', ...) to probe WordCraft's dirty flag
		// and prevent duplicate browser unload dialogs when managed by the Nextcloud modal.
		const origAddEventListener = window.addEventListener.bind(window);
		window.addEventListener = function (type, listener, options) {
			if (type === 'beforeunload' && typeof listener === 'function') {
				wasmBeforeUnloadCheck = listener;
				// Wrap so we only trigger native dialog if window is top-level
				const wrapped = function (e) {
					if (window.parent && window.parent !== window) {
						return;
					}
					return listener(e);
				};
				return origAddEventListener(type, wrapped, options);
			}
			return origAddEventListener(type, listener, options);
		};

		// Poll dirty flag from WordCraft's beforeunload closure
		window.setInterval(() => {
			if (typeof wasmBeforeUnloadCheck === 'function') {
				const probe = {
					prevented: false,
					returnValue: '',
					preventDefault() {
						this.prevented = true;
					},
				};
				try {
					wasmBeforeUnloadCheck(probe);
					reportDirty(probe.prevented || Boolean(probe.returnValue));
				} catch (_) {
					// Ignore probe errors
				}
			}
		}, 500);

		// 2. Provide custom window.showSaveFilePicker so WordCraft saves directly to Nextcloud
		// and marks its internal AsyncSaves ticket as Saved once Nextcloud confirms.
		window.showSaveFilePicker = async function (pickerOpts) {
			const suggestedName = pickerOpts?.suggestedName || currentFileName;
			return {
				name: suggestedName,
				kind: 'file',
				async createWritable() {
					const chunks = [];
					return {
						async write(data) {
							if (data instanceof Uint8Array) {
								chunks.push(new Uint8Array(data));
							} else if (data instanceof ArrayBuffer) {
								chunks.push(new Uint8Array(data));
							} else if (ArrayBuffer.isView(data)) {
								chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
							} else if (data instanceof Blob) {
								const buf = await data.arrayBuffer();
								chunks.push(new Uint8Array(buf));
							}
						},
						async close() {
							const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
							const merged = new Uint8Array(total);
							let offset = 0;
							for (const c of chunks) {
								merged.set(c, offset);
								offset += c.byteLength;
							}
							await sendSaveToNextcloud(suggestedName, merged.buffer);
						},
					};
				},
			};
		};

		// 3. Intercept Blob URLs + <a download> clicks (used by DeckCraft and export fallbacks)
		const origCreateObjectURL = URL.createObjectURL.bind(URL);
		const origRevokeObjectURL = URL.revokeObjectURL.bind(URL);

		URL.createObjectURL = function (obj) {
			const url = origCreateObjectURL(obj);
			if (obj instanceof Blob) {
				blobUrlRegistry.set(url, obj);
			}
			return url;
		};

		URL.revokeObjectURL = function (url) {
			window.setTimeout(() => {
				blobUrlRegistry.delete(url);
				origRevokeObjectURL(url);
			}, 5000);
		};

		const origAnchorClick = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = function () {
			const downloadAttr = this.getAttribute('download') ?? this.download;
			const href = this.getAttribute('href') || this.href || '';
			if (downloadAttr !== null && href.startsWith('blob:')) {
				const blob = blobUrlRegistry.get(href);
				const name = downloadAttr || currentFileName;
				if (blob) {
					blob.arrayBuffer().then((buffer) => {
						sendSaveToNextcloud(name, buffer);
					});
					return;
				}
				fetch(href)
					.then((r) => r.arrayBuffer())
					.then((buffer) => {
						sendSaveToNextcloud(name, buffer);
					})
					.catch((err) => {
						console.error(`[${moduleName}-bridge] Failed to read blob download:`, err);
					});
				return;
			}
			return origAnchorClick.apply(this, arguments);
		};

		// 4. Observe #<module>_loading removal or error to notify parent `<module>:ready` or `<module>:failed`
		function observeStartup() {
			const loadingId = `${moduleName}_loading`;
			let readySent = false;

			const checkLoadingState = () => {
				if (readySent) return;
				const loadingEl = document.getElementById(loadingId);
				if (!loadingEl) {
					readySent = true;
					// Wait two animation frames so eframe has completed its initial pass and font setup
					window.requestAnimationFrame(() => {
						window.requestAnimationFrame(() => {
							postToParent({
								type: `${moduleName}:ready`,
								version: moduleVersion,
							});
						});
					});
					return;
				}
				const text = loadingEl.textContent || '';
				if (/failed to start/i.test(text)) {
					readySent = true;
					postToParent({
						type: `${moduleName}:failed`,
						error: text.trim(),
					});
				}
			};

			const observer = new MutationObserver(checkLoadingState);
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true,
				characterData: true,
			});
			checkLoadingState();
		}

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', observeStartup, { once: true });
		} else {
			observeStartup();
		}
	}

	// Listen for messages from the Nextcloud parent page
	window.addEventListener('message', (event) => {
		if (event.origin !== origin || event.source !== window.parent) {
			return;
		}
		const data = event.data;
		if (!data || typeof data.type !== 'string') {
			return;
		}

		if (data.type === `${moduleName}:open`) {
			if (data.name) {
				currentFileName = data.name;
			}
			if (!hasNativeHostBridge && data.bytes) {
				injectFileIntoCanvas(currentFileName, data.bytes);
				reportDirty(false);
			}
		} else if (data.type === `${moduleName}:saved`) {
			const pending = pendingSaveResolvers.get(data.saveId);
			if (pending) {
				pendingSaveResolvers.delete(data.saveId);
				if (data.ok === false) {
					pending.reject(data.error);
				} else {
					pending.resolve();
				}
			}
		} else if (data.type === `${moduleName}:request-save`) {
			triggerSyntheticSaveShortcut(Boolean(data.closeBackstageFirst));
		}
	});
})();
