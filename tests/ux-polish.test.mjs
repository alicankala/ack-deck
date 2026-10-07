import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function tickerHarness() {
  let cursor = 0, effectCursor = 0, nextTimer = 0, fail = false, city = 'Ankara', now = 1000000;
  const states = [], effects = [], pending = [], timers = new Map(), listeners = new Map();
  const calls = { rates: 0, weather: 0 };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useEffect(fn, deps) { const i = effectCursor++; const old = effects[i]; if (!old || deps.some((dep, j) => dep !== old.deps[j])) { old?.cleanup?.(); effects[i] = { deps }; pending.push(() => { effects[i].cleanup = fn(); }); } },
  };
  const data = {
    FOOTER_REFRESH_MS: 1800000,
    loadWeatherCity: () => city,
    weatherDescription: () => 'Açık',
    fetchRates: async () => { calls.rates++; if (fail) throw 'Alınamadı'; return { date: '05.10.2026', rates: ['USD', 'EUR', 'GBP'].map(code => ({ code, buying: 40, selling: 41 })) }; },
    fetchWeather: async requested => { calls.weather++; if (fail) throw 'Alınamadı'; return { city: requested, code: 0, temperature: 20 }; },
  };
  const exports = {};
  const source = ts.transpileModule(read('src/components/FooterTicker.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h' } }).outputText;
  runInNewContext(source, { exports, require: id => id === 'react' ? react : data, h: (type, props, ...children) => ({ type, props, children }), Date: { now: () => now }, window: {
    setInterval(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearInterval(id) { timers.delete(id); },
    addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); },
  } });
  const render = () => { cursor = effectCursor = 0; const tree = exports.FooterTicker(); while (pending.length) pending.shift()(); return tree.children[0]; };
  return { render, calls, timers, listeners, fail: () => { fail = true; }, city: value => { city = value; listeners.get('ack-weather-city-changed')(); }, tick: ms => { now += ms; for (const timer of [...timers.values()]) if (timer.ms === ms) timer.fn(); }, unmount: () => effects.forEach(effect => effect.cleanup?.()) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('ticker pauses on hover/focus, click advances, resumes and cleans up; refresh is independent', async () => {
  const env = tickerHarness(); let button = env.render(); await settle(); button = env.render();
  assert.equal(button.type, 'button'); assert.equal(button.props.type, 'button');
  assert.match(button.props['aria-label'], /Ankara/);
  button.props.onMouseEnter(); button = env.render();
  assert.equal([...env.timers.values()].some(timer => timer.ms === 5000), false);
  assert.equal([...env.timers.values()].some(timer => timer.ms === 1800000), true);
  button.props.onClick(); button = env.render(); assert.match(button.props['aria-label'], /Dolar/);
  button.props.onFocus(); button.props.onMouseLeave(); button = env.render();
  assert.equal([...env.timers.values()].some(timer => timer.ms === 5000), false);
  button.props.onBlur(); button = env.render(); env.tick(5000); button = env.render(); assert.match(button.props['aria-label'], /Euro/);
  assert.equal(env.calls.rates, 1); assert.equal(env.calls.weather, 1);
  env.unmount(); assert.equal(env.timers.size, 0); assert.equal(env.listeners.size, 0);
});

test('ticker preserves last data on refresh failure and never shows another city weather', async () => {
  const env = tickerHarness(); env.render(); await settle(); env.render();
  env.fail(); env.tick(1800000); await settle();
  let button = env.render(); assert.match(button.props['aria-label'], /20°C.*Son veri/);
  button.props.onClick(); button = env.render(); assert.match(button.props['aria-label'], /40,00 \/ 41,00.*Son veri/);
  assert.equal(env.calls.rates, 2); assert.equal(env.calls.weather, 2);
  env.city('İzmir'); env.render(); await settle();
  button = env.render(); assert.match(button.props['aria-label'], /İzmir: Alınamadı/); assert.doesNotMatch(button.props['aria-label'], /20°C/);
  env.unmount();
});

test('sidebar uses consolidated destinations, settings uses six panels and compact desktop rules remain bounded', () => {
  const sidebar = read('src/components/Sidebar.tsx');
  for (const page of ['home', 'tasks', 'ai', 'projects', 'notes', 'inbox', 'subscriptions', 'tools']) assert.equal(sidebar.match(new RegExp(`id: "${page}"`, 'g'))?.length, 1);
  assert.doesNotMatch(sidebar, /id: "workspaces"|id: "files"/);
  assert.match(sidebar, /label: "Kayıtlar"/);
  const settings = read('src/components/Settings.tsx');
  assert.equal(settings.match(/role="tabpanel"/g)?.length, 6);
  for (const id of ['general', 'appearance', 'ai', 'phone', 'data', 'updates']) assert.ok(settings.includes(`id="settings-panel-${id}"`));
  for (const child of ['DesktopSettings', 'PaletteShortcutSettings', 'DisplayScaleSettings', 'WeatherSettings', 'PhoneSettings', 'BackupSettings', 'AboutSettings', 'UpdateSettings']) assert.equal(settings.match(new RegExp(`<${child}[ />]`, 'g'))?.length, 1);
  const css = read('src/App.css');
  assert.match(css, /\.main-content \{ padding: var\(--page-padding\); container-type: inline-size; \}/);
  assert.match(css, /\.toast, \.undo-toasts \{ bottom: var\(--footer-clearance\)/);
  assert.match(css, /\.record-menu-panel[^}]*position: fixed/s);
  assert.match(css, /@container \(max-width: 58rem\)/);
  for (const [width, height] of [[1280,720],[1366,768],[1440,900],[1920,1080],[2560,1440],[2560,1600]]) for (const scale of [90,100,105,110,115,125]) {
    const rem = 15 * scale / 100, content = Math.min(1800, width - 228 * scale / 100 - 3.2 * rem);
    assert.ok(content > 650, `${width}x${height}/${scale}`);
    const stacked = content <= 58 * rem;
    const noteEditor = stacked ? content - 2.4 * rem : content - 20 * rem - 2.4 * rem;
    assert.ok(noteEditor >= 20 * rem);
    assert.ok(height - 12 * rem > 0);
  }
});
