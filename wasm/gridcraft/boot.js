import init, * as bindings from './gridcraft-web-47d72c1e9c3ab366.js';
const wasm = await init({ module_or_path: './gridcraft-web-47d72c1e9c3ab366_bg.wasm' });


window.wasmBindings = bindings;


dispatchEvent(new CustomEvent("TrunkApplicationStarted", {detail: {wasm}}));
