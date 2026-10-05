import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import { setupModules } from './helpers.mjs';

const monitor = (name, x = 0, dpi = 1) => ({ name, position: { x, y: 0 }, size: { width: 2560, height: 1440 }, scaleFactor: dpi });
test('monitor scales persist independently, reset only the current monitor, and preserve unrelated preferences', () => {
  const env = setupModules([['ack-deck.preferences.v1', '{"startPage":"ai","pcRefreshMs":5000}']]);
  const store = env.load('displayScaleStore');
  const laptop = store.monitorKey(monitor('DISPLAY1', 0, 2)), external = store.monitorKey(monitor('DISPLAY2', 2560));
  store.saveMonitorScale(laptop, 100); store.saveMonitorScale(external, 115);
  const reloaded = setupModules([...env.values]).load('displayScaleStore');
  assert.equal(reloaded.displayScaleFor(reloaded.readDisplayPreferences(), laptop), 100);
  assert.equal(reloaded.displayScaleFor(reloaded.readDisplayPreferences(), external), 115);
  store.saveMonitorScale(laptop, null);
  assert.equal(store.readDisplayPreferences().monitors[external], 115);
  assert.equal(store.displayScaleFor(store.readDisplayPreferences(), 'name:new-display'), 100);
  assert.equal(env.values.get('ack-deck.preferences.v1'), '{"startPage":"ai","pcRefreshMs":5000}');
});
test('device identity survives DPI/resolution/position changes; unnamed monitor fallback is deterministic', () => {
  const { monitorKey } = setupModules().load('displayScaleStore');
  assert.equal(monitorKey(monitor('DISPLAY1')), monitorKey({ ...monitor('DISPLAY1', 2560, 2), size: { width: 1920, height: 1080 } }));
  assert.notEqual(monitorKey(monitor('DISPLAY1')), monitorKey(monitor('DISPLAY2')));
  assert.equal(monitorKey(monitor(null)), 'geometry:0,0:2560x1440');
  assert.notEqual(monitorKey(monitor(null)), monitorKey(monitor(null, 2560)));
});
test('damaged storage and quota errors never overwrite saved preferences; invalid scales are rejected', () => {
  for (const raw of ['broken', '[]', '{"defaultScale":100,"monitors":{"name:a":999}}']) {
    const env = setupModules([['ack-deck.display-scale.v1', raw]]);
    assert.throws(() => env.load('displayScaleStore').saveMonitorScale('name:a', 110));
    assert.equal(env.values.get('ack-deck.display-scale.v1'), raw);
  }
  const env = setupModules([], { failWrite: () => true });
  assert.throws(() => env.load('displayScaleStore').saveMonitorScale('name:a', 110));
  assert.equal(env.values.size, 0);
  assert.throws(() => setupModules().load('displayScaleStore').saveMonitorScale('name:a', 140));
});
test('movement bursts debounce; stale reads are discarded and cleanup cancels late listeners', async () => {
  const { observeMonitor } = setupModules().load('monitorObserver');
  const readings = [], callbacks = [], pending = [];
  let reads = 0, unlistened = 0, releaseListener;
  const stop = observeMonitor({ read: () => { reads++; return new Promise(resolve => pending.push(resolve)); }, subscribe: change => { callbacks.push(change); return [new Promise(resolve => { releaseListener = resolve; })]; } }, value => readings.push(value), 5);
  callbacks[0](); callbacks[0](); callbacks[0]();
  pending[0](monitor('old'));
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(reads, 2); assert.equal(readings.length, 0);
  pending[1](monitor('new')); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(readings[0].name, 'new');
  callbacks[0](); stop(); releaseListener(() => unlistened++);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(reads, 2); assert.equal(unlistened, 1);
});
test('observer switches monitors without storage writes or a restart and handles query failures', async () => {
  const env = setupModules(), store = env.load('displayScaleStore');
  const a = monitor('a'), b = monitor('b'); store.saveMonitorScale(store.monitorKey(b), 125);
  let current = a, change; const scales = [];
  const before = env.values.get(store.DISPLAY_SCALE_KEY);
  const stop = env.load('monitorObserver').observeMonitor({ read: async () => current, subscribe: callback => { change = callback; return [Promise.resolve(() => {})]; } }, m => scales.push(store.displayScaleFor(store.readDisplayPreferences(), m ? store.monitorKey(m) : null)), 1);
  await new Promise(resolve => setTimeout(resolve, 0)); current = b; change(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(scales, [100, 125]); assert.equal(env.values.get(store.DISPLAY_SCALE_KEY), before); stop();
  const failures = [];
  const cleanup = env.load('monitorObserver').observeMonitor({ read: async () => { throw new Error('unavailable'); }, subscribe: () => [] }, value => failures.push(value));
  await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(failures, [null]); cleanup();
});
test('logical CSS viewport and scale matrix retains bounded content, shrinking columns and compact palette', () => {
  // Structural CSS validation only: this does not claim WebView pixel/overflow inspection.
  const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8'), ast = postcss.parse(css);
  const declarations = selector => { const result = {}; ast.walkRules(selector, rule => rule.walkDecls(d => { result[d.prop] = d.value; })); return result; };
  assert.equal(declarations(':root')['--content-max'], '1800px');
  assert.equal(declarations(':root')['font-size'], 'calc(15px * var(--ui-scale))');
  assert.equal(declarations('.command-dialog')['--ui-unit'], '1px');
  assert.match(declarations('.command-dialog').width, /680px/);
  assert.match(declarations('.command-dialog').width, /100vw/);
  assert.match(css, /@container \(max-width: 50rem\)/);
  assert.match(css, /@container \(max-width: 34rem\)/);
  assert.match(declarations('.hub-path')['text-overflow'], /ellipsis/);
  assert.equal(declarations('.main-content')['min-width'], '0');
  assert.doesNotMatch(css, /(?:transform:\s*scale\(|\bzoom\s*:)/);
  for (const [width, height] of [[1280, 800], [1920, 1080], [2560, 1440], [700, 540]]) {
    for (const scale of [100, 110, 115, 125]) {
      const unit = scale / 100;
      const sidebar = (width <= 780 ? 66 : width <= 1100 ? 196 : 228) * unit;
      const padding = width <= 700 ? 15 * unit : width <= 780 ? 24 * unit : width <= 1100 ? 30 * unit : Math.min(72 * unit, Math.max(24 * unit, width * .042));
      const remaining = Math.min(1800, width - sidebar - 2 * padding);
      assert.ok(remaining > 300, `${width}x${height} at ${scale}% leaves useful content space`);
      assert.ok(Math.min(680, width - 32) < width, 'palette stays within logical width');
      assert.equal(15 * unit, 15 * scale / 100);
    }
  }
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /if \(paletteWindow\) root.render\(<React.StrictMode><PaletteWindow/);
  assert.match(main, /<DisplayScaleProvider><App/);
});

test('actual provider applies root scale live, resolves the window center, and cleans up all native listeners', async () => {
  const env = setupModules(), store = env.load('displayScaleStore');
  const a = monitor('laptop'), b = monitor('external', 2560);
  store.saveMonitorScale(store.monitorKey(b), 115);
  let current = a, point, cursor = 0, effectCursor = 0, unlistened = 0;
  const slots = [], effects = [], pending = [], events = [], properties = new Map();
  const root = { dataset: {}, style: { setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k) } };
  const react = {
    createContext: () => ({ Provider: 'provider' }), useContext: () => {},
    useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useEffect: effect, useLayoutEffect: effect,
  };
  function effect(callback, deps) { const index = effectCursor++, old = effects[index]; if (!old || deps.some((v, i) => v !== old.deps[i])) { effects[index] = { callback, deps, cleanup: old?.cleanup }; pending.push(index); } }
  const listen = async callback => { events.push(callback); return () => unlistened++; };
  const native = { getCurrentWindow: () => ({ outerPosition: async () => ({ x: 2400, y: 200 }), outerSize: async () => ({ width: 1200, height: 800 }), onMoved: listen, onResized: listen, onScaleChanged: listen }), monitorFromPoint: async (x, y) => { point = [x, y]; return current; }, currentMonitor: async () => current, availableMonitors: async () => [a, b] };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/DisplayScale.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, document: { documentElement: root }, require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }) } : name === '@tauri-apps/api/window' ? native : env.load(name.slice(2)),
  });
  function render() { cursor = 0; effectCursor = 0; const tree = exports.DisplayScaleProvider({ children: 'app' }); for (const i of pending.splice(0)) { effects[i].cleanup?.(); effects[i].cleanup = effects[i].callback(); } return tree.props.value; }
  render(); await new Promise(resolve => setTimeout(resolve, 5));
  let context = render(); assert.deepEqual(point, [3000, 600]); assert.equal(context.label, 'Ekran 1'); assert.equal(properties.get('--ui-scale'), '1');
  current = b; events[0](); await new Promise(resolve => setTimeout(resolve, 230));
  context = render(); assert.equal(context.label, 'Ekran 2'); assert.equal(properties.get('--ui-scale'), '1.15'); assert.equal(root.dataset.uiScale, '115');
  assert.equal(context.change(125), true); render(); assert.equal(properties.get('--ui-scale'), '1.25');
  effects.forEach(item => item.cleanup?.()); assert.equal(unlistened, 3); assert.equal(properties.has('--ui-scale'), false);
});
