import init, * as bindings from './wordcraft-web-dac7e7b375acbaf2.js';
const wasm = await init({ module_or_path: './wordcraft-web-dac7e7b375acbaf2_bg.wasm' });


window.wasmBindings = bindings;


dispatchEvent(new CustomEvent("TrunkApplicationStarted", {detail: {wasm}}));
