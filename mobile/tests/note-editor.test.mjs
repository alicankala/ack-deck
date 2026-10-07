import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('long note fields resize on editing and width changes, with resize cleanup', () => {
  const exports = {}, effects = [], listeners = new Map();
  const fields = [{ style: {}, scrollHeight: 86 }, { style: {}, scrollHeight: 1480 }];
  let index = 0;
  const react = { useRef: () => ({ current: fields[index++] }), useLayoutEffect: effect => effects.push(effect) };
  const source = ts.transpileModule(readFileSync(new URL('../src/NoteEditor.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'h' } }).outputText;
  runInNewContext(source, { exports, h: (type, props, ...children) => ({ type, props, children }), window: { addEventListener: (event, handler) => listeners.set(event, handler), removeEventListener: (event, handler) => { if (listeners.get(event) === handler) listeners.delete(event); } }, require: name => name === 'react' ? react : { Icon: () => null } });
  exports.NoteEditor({ title: 'Long title', content: 'Long note', busy: false, error: '', onTitle() {}, onContent() {}, onClose() {}, onSubmit() {} });
  const cleanup = effects[0]();
  assert.equal(fields[0].style.height, '86px');
  assert.equal(fields[1].style.height, '1480px');
  fields[0].scrollHeight = 130; fields[1].scrollHeight = 2000;
  listeners.get('resize')();
  assert.equal(fields[0].style.height, '130px');
  assert.equal(fields[1].style.height, '2000px');
  fields[1].scrollHeight = 240;
  listeners.get('resize')();
  assert.equal(fields[1].style.height, '240px');
  cleanup(); assert.equal(listeners.size, 0);
});
