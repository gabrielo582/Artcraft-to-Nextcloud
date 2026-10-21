import init, * as bindings from './deckcraft-web-c22a3bfc8b8eeaf6.js';
const wasm = await init({ module_or_path: './deckcraft-web-c22a3bfc8b8eeaf6_bg.wasm?v=patched1' });


window.wasmBindings = bindings;


dispatchEvent(new CustomEvent("TrunkApplicationStarted", {detail: {wasm}}));
