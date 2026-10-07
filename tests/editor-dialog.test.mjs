import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function mount(busy) {
  const exports = {}, effects = [];
  const element = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  let closed = 0;
  const source = ts.transpileModule(readFileSync(new URL('../src/components/EditorDialog.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'h' } }).outputText;
  runInNewContext(source, { exports, h: (type, props, ...children) => ({ type, props, children }), require: () => ({ useId: () => 'editor-title', useRef: () => ({ current: element }), useEffect: effect => effects.push(effect) }) });
  const tree = exports.EditorDialog({ title: 'Edit', busy, children: null, onClose: () => closed++ });
  const cleanup = effects[0]();
  return { tree, element, cleanup, closed: () => closed };
}
test('editor opens as modal and closes on cleanup', () => {
  const mounted = mount(false);
  assert.equal(mounted.element.open, true);
  assert.equal(mounted.tree.props['aria-labelledby'], 'editor-title');
  let prevented = false;
  mounted.tree.props.onCancel({ preventDefault: () => prevented = true });
  assert.equal(prevented, true);
  assert.equal(mounted.closed(), 1);
  mounted.cleanup();
  assert.equal(mounted.element.open, false);
});
test('busy editor blocks escape cancellation and disables close button', () => {
  const mounted = mount(true);
  mounted.tree.props.onCancel({ preventDefault() {} });
  assert.equal(mounted.closed(), 0);
  assert.equal(mounted.tree.children[0].children[1].props.disabled, true);
  mounted.cleanup();
});
