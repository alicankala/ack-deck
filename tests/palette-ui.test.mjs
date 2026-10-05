import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { posix } from 'node:path';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
// Actual palette event handlers with isolated state/IPC; no native input or real profile access.
function runtime() {
  const modules = {}, states = [], values = new Map(), calls = []; let cursor = 0;
  class Element { constructor(id) { this.id = id; } closest() { return null; } focus() {} scrollIntoView() {} }
  const input = new Element('global-search-query');
  const hooks = { useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; }, useRef: initial => { const index = cursor++; return states[index] ??= { current: initial }; }, useEffect: () => {} };
  function load(name) {
    if (modules[name]) return modules[name]; const exports = modules[name] = {};
    const tsx = new URL('../src/' + name + '.tsx', import.meta.url), file = existsSync(tsx) ? tsx : new URL('../src/' + name + '.ts', import.meta.url);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports, require: id => id === 'react' ? hooks : id === 'react/jsx-runtime' ? jsx : id === '@tauri-apps/api/core' ? { invoke: async (command, args) => { calls.push({ command, args }); return 'Kaydedildi'; } } : id === '@tauri-apps/api/event' ? { listen: async () => () => {} } : load(posix.normalize(posix.join(posix.dirname(name), id))), URL, crypto: webcrypto, Date, HTMLElement: Element, document: { getElementById: () => input }, window: { localStorage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }, setTimeout: fn => { fn(); return 1; }, clearTimeout: () => {} } });
    return exports;
  }
  const Component = load('components/LauncherPalette').LauncherPalette;
  return { values, calls, input, Element, render: props => { cursor = 0; return Component(props); } };
}
function find(tree, predicate) { if (!tree || typeof tree !== 'object') return null; if (predicate(tree)) return tree; const children = tree.props?.children; for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) { const result = find(child, predicate); if (result) return result; } return null; }
const settle = () => new Promise(resolve => setImmediate(resolve));
test('palette arrows select capture, Enter saves task without opening main, Escape closes', async () => {
  const env = runtime(); let closed = 0, navigated = 0; const props = { onNavigate: () => navigated++, onClose: () => closed++ };
  let tree = env.render(props); tree.props.onKeyDown({ key: 'ArrowDown', target: env.input, preventDefault() {} });
  tree = env.render(props); tree.props.onKeyDown({ key: 'Enter', target: env.input, preventDefault() {} });
  tree = env.render(props); const textarea = find(tree, v => v.type === 'textarea'); assert.ok(textarea); textarea.props.onChange({ target: { value: 'SD kart al' } });
  tree = env.render(props); find(tree, v => v.type === 'form').props.onSubmit({ preventDefault() {} }); await settle();
  assert.equal(JSON.parse(env.values.get('ack-deck.tasks.v1'))[0].text, 'SD kart al'); assert.equal(navigated, 0); assert.equal(env.calls.length, 0); assert.equal(closed, 1);
  tree = env.render(props); tree.props.onKeyDown({ key: 'Escape', target: env.input, preventDefault() {} }); assert.equal(closed, 2);
});
test('Enter on close button does not run a selected command, and standalone capture routes only through main IPC', async () => {
  const env = runtime(); let navigated = 0; const props = { standalone: true, onNavigate: () => navigated++, onClose: () => {} };
  let tree = env.render(props); let prevented = false; tree.props.onKeyDown({ key: 'Enter', target: new env.Element('close'), preventDefault() { prevented = true; } }); assert.equal(prevented, false); assert.equal(navigated, 0);
  tree.props.onKeyDown({ key: 'ArrowDown', target: env.input, preventDefault() {} }); tree = env.render(props); tree.props.onKeyDown({ key: 'ArrowDown', target: env.input, preventDefault() {} }); tree = env.render(props); tree.props.onKeyDown({ key: 'Enter', target: env.input, preventDefault() {} });
  tree = env.render(props); find(tree, v => v.type === 'textarea').props.onChange({ target: { value: 'Tang Nano notu' } }); tree = env.render(props); find(tree, v => v.type === 'form').props.onSubmit({ preventDefault() {} }); await settle();
  assert.equal(env.calls.length, 1); assert.equal(env.calls[0].command, 'palette_request'); assert.equal(env.calls[0].args.request.kind, 'note'); assert.equal(env.values.size, 0); assert.equal(navigated, 0);
});
