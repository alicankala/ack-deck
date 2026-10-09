import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { posix } from 'node:path';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupModules } from './helpers.mjs';
const key = name => `ack-deck.${name}.v1`;
const task = (id, date, time, completed = false) => ({ id, text: id, completed, dueDate: date, dueTime: time, priority: 'normal', reminder: false });

test('daily summary prioritizes overdue, today and only the nearest upcoming task, with at most five', () => {
  const api = setupModules().load('dashboardData');
  const tasks = [task('next-next', '2026-10-06', null), task('next', '2026-10-05', '09:00'), task('today', '2026-10-04', '15:00'), task('past-time', '2026-10-04', '09:00'), task('past-date', '2026-10-03', null), task('done', '2026-10-03', null, true), task('undated', null, null)];
  const shown = api.todayTasks(tasks, new Date('2026-10-04T12:00:00'));
  assert.deepEqual([...shown.map(item => item.task.id)], ['past-date', 'past-time', 'today', 'next']);
  assert.equal(shown[1].label, 'Zamanı geçti'); assert.equal(shown[2].label, 'Bugün');
  assert.equal(api.todayTasks([...tasks, ...Array.from({ length: 10 }, (_, i) => task('extra-' + i, '2026-10-04', null))], new Date('2026-10-04T12:00:00')).length, 5);
  assert.equal(api.todayTasks([], new Date()).length, 0);
});
test('recent references are bounded, deduplicated, persistent and contain no copied paths/content', () => {
  const env = setupModules([['unrelated', 'keep']]), api = env.load('recentStore');
  for (let i = 0; i < 24; i++) assert.equal(api.recordRecent('projects', 'p' + i, 'vscode', 100 + i), true);
  assert.equal(api.loadRecents().entries.length, 20);
  api.recordRecent('projects', 'p23', 'folder', 200);
  const saved = JSON.parse(env.values.get(key('recent-items')));
  assert.equal(saved.length, 20); assert.equal(saved[0].mode, 'folder'); assert.equal(new Set(saved.map(item => item.id)).size, 20);
  assert.deepEqual(Object.keys(saved[0]).sort(), ['id', 'mode', 'source', 'usedAt']); assert.equal(env.values.get('unrelated'), 'keep');
  const reloaded = setupModules([...env.values]).load('recentStore'); assert.equal(reloaded.loadRecents().entries[0].id, 'p23');
  api.recordRecent('notes', 'old-edit', undefined, 1);
  assert.equal(api.loadRecents().entries.some(item => item.id === 'old-edit'), false);
});
test('recent resolution uses current records, skips removed IDs and opens the correct record pages', () => {
  const env = setupModules([
    [key('projects'), JSON.stringify([{ id: 'p', name: 'New name', description: '', folderPath: 'C:\\fixture' }])],
    [key('notes'), JSON.stringify([{ id: 'n', title: 'Pin notes', content: 'Not copied', updatedAt: 100 }])],
    [key('archive'), JSON.stringify([{ id: 'a', title: 'Receipt', category: 'Fatura', description: '', date: null, tags: [], file: null, createdAt: 1, updatedAt: 1 }])],
    [key('files'), JSON.stringify([{ id: 'f', name: 'PDF', fileName: 'fixture.pdf', path: 'C:\\fixture.pdf', kind: 'file', extension: 'pdf', sizeBytes: 10, modifiedAt: 1 }])],
  ]), api = env.load('recentStore');
  api.recordRecent('projects', 'removed', 'folder', 500); api.recordRecent('projects', 'p', 'vscode', 400); api.recordRecent('files', 'f', undefined, 300); api.recordRecent('archive', 'a', undefined, 200);
  const resolved = api.resolveRecents(); assert.equal(resolved.length, 4); assert.equal(resolved[0].title, 'New name');
  assert.deepEqual([...resolved.map(item => item.target.page)], ['projects', 'files', 'archive', 'notes']);
  assert.equal(resolved[1].target.id, 'f'); assert.equal(resolved[3].target.id, 'n');
  assert.equal(JSON.stringify(env.values.get(key('recent-items'))).includes('fixture.pdf'), false);
  api.recordRecent('notes', 'n', undefined, 50);
  env.values.set(key('notes'), JSON.stringify([{ id: 'n', title: 'Updated note', content: '', updatedAt: 600 }]));
  assert.equal(api.resolveRecents()[0].title, 'Updated note'); assert.equal(api.resolveRecents()[0].usedAt, 600);
});

test('daily AI starter routes only real today tasks into context', async () => {
  const now = new Date(), date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const env = setupModules([[key('tasks'), JSON.stringify([task('Daily fixture', date, null), task('Not today', '2099-01-01', null)])]]);
  const result = await env.load('ackIntegration').collectAckContext('Bugün ne yapmam gerekiyor?');
  assert.equal(result.context.length, 1); assert.equal(result.context[0].source, 'tasks');
  assert.match(JSON.stringify(result.context), /Daily fixture/); assert.doesNotMatch(JSON.stringify(result.context), /Not today/);
});
test('dashboard projects follow recent use and missing native programs never create a successful recent item', async () => {
  const projects = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, name: 'Project ' + i, description: '', folderPath: 'C:\\fixture' }));
  const env = setupModules([[key('projects'), JSON.stringify(projects)]]), recent = env.load('recentStore'), api = env.load('dashboardData'), commands = env.load('commandPalette');
  await assert.rejects(commands.openRegisteredProject('p3', 'vscode', async () => { throw new Error('missing'); })); assert.equal(recent.loadRecents().entries.length, 0);
  await commands.openRegisteredProject('p3', 'vscode'); assert.equal(env.calls[0].command, 'open_project_in_vscode');
  assert.equal(api.dashboardProjects(projects)[0].id, 'p3'); assert.equal(api.dashboardProjects(projects).length, 3); assert.equal(projects[0].id, 'p0');
  await assert.rejects(commands.openRegisteredProject('unknown', 'folder')); assert.equal(env.calls.length, 1);
});
test('damaged or denied recent storage preserves saved data and does not overwrite other records', () => {
  const broken = setupModules([[key('recent-items'), '{broken'], [key('notes'), '[]']]), api = broken.load('recentStore');
  assert.equal(api.recordRecent('notes', 'n'), false); assert.equal(api.loadRecents().locked, true); assert.equal(broken.values.get(key('recent-items')), '{broken');
  const denied = setupModules([['other', 'keep']], { failWrite: () => true }); assert.equal(denied.load('recentStore').recordRecent('projects', 'p'), false); assert.equal(denied.values.get('other'), 'keep');
});

// Execute actual feature components with controlled hook lifecycles and a fake IPC transport.
// No credential, network, browser profile or real user storage is touched.
function featureRuntime(initial = [], native = () => true, useRealReact = false) {
  const values = new Map(initial), calls = [], modules = {}, slots = [], effectSlots = [], pendingEffects = [], timers = new Map();
  let cursor = 0, effectCursor = 0, timerId = 0;
  const hooks = { useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; }, useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; }, useEffect: (callback, deps) => { const index = effectCursor++, previous = effectSlots[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) { effectSlots[index] = { deps, callback, cleanup: previous?.cleanup }; pendingEffects.push(index); } } };
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const window = { localStorage: storage, setInterval: (fn, interval) => { const id = ++timerId; timers.set(id, { fn, interval }); return id; }, clearInterval: id => timers.delete(id), dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
  function load(name) {
    if (modules[name]) return modules[name]; const exports = {}; modules[name] = exports;
    const path = new URL('../src/' + name + '.tsx', import.meta.url), sourcePath = existsSync(path) ? path : new URL('../src/' + name + '.ts', import.meta.url);
    const source = ts.transpileModule(readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports, require: id => id === './MarkdownText' ? { MarkdownText: () => null } : id === 'react' ? useRealReact ? React : hooks : id === 'react/jsx-runtime' ? jsxRuntime : id === '@tauri-apps/api/core' ? { invoke: async (command, args) => { calls.push({ command, args }); return native(command, args); } } : id === '@tauri-apps/plugin-dialog' ? {} : load(posix.normalize(posix.join(posix.dirname(name), id))), crypto: webcrypto, TextEncoder, window, document: { getElementById: () => null }, Date });
    return exports;
  }
  const render = (Component, props) => { cursor = 0; effectCursor = 0; const tree = Component(props); for (const index of pendingEffects.splice(0)) { const effect = effectSlots[index]; effect.cleanup?.(); effect.cleanup = effect.callback(); } return tree; };
  const strictReplay = () => { effectSlots.forEach(effect => effect.cleanup?.()); effectSlots.forEach(effect => { effect.cleanup = effect.callback(); }); };
  const dispose = () => effectSlots.forEach(effect => effect.cleanup?.());
  return { load, calls, values, timers, render, strictReplay, dispose };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('dashboard handoff reaches the existing Gemini send pipeline once, including StrictMode replay', async () => {
  const env = featureRuntime([], command => command === 'gemini_key_status' ? true : { text: 'Yanıt', action: null }), Component = env.load('components/AckAi').AckAi;
  let messages = [], consumed = 0;
  const props = { messages, initialPrompt: { id: 'submission', text: 'Türkiye’nin başkenti nedir?' }, onMessagesChange: next => { messages = typeof next === 'function' ? next(messages) : next; }, onPromptConsumed: () => consumed++, onOpenSettings: () => {}, onNavigate: () => {} };
  env.render(Component, props); env.strictReplay(); await settle(); env.render(Component, { ...props, messages }); await settle(); env.render(Component, { ...props, messages });
  const requests = env.calls.filter(call => call.command === 'gemini_chat'); assert.equal(requests.length, 1); assert.equal(consumed, 1);
  assert.equal(requests[0].args.messages.at(-1).text, props.initialPrompt.text); assert.equal(requests[0].args.context.length, 0); assert.equal(messages.at(-1).text, 'Yanıt'); env.dispose();
});
test('handoff without a saved key stays unsent, and task drafts still require the existing approval card', async () => {
  const env = featureRuntime([], () => false), Component = env.load('components/AckAi').AckAi;
  let consumed = 0; const props = { messages: [], initialPrompt: { id: 'missing-key', text: 'Test' }, onMessagesChange: () => {}, onPromptConsumed: () => consumed++, onOpenSettings: () => {}, onNavigate: () => {} };
  env.render(Component, props); await settle(); env.render(Component, props); assert.equal(consumed, 0); assert.equal(env.calls.some(call => call.command === 'gemini_chat'), false); env.dispose();
  const approved = featureRuntime([], () => true), Ai = approved.load('components/AckAi').AckAi;
  let messages = []; const request = { ...props, initialPrompt: { id: 'task', text: 'SD kart al görevlerime ekle.' }, onMessagesChange: next => { messages = typeof next === 'function' ? next(messages) : next; } };
  approved.render(Ai, request); await settle(); approved.render(Ai, { ...request, messages }); await settle();
  assert.match(messages.at(-1).text, /onay|oluşturulsun/); assert.equal(approved.values.has(key('tasks')), false); assert.equal(approved.calls.some(call => call.command === 'gemini_chat'), false); approved.dispose();
});
test('compact PC strip uses actual backend percentages, preserves refresh interval, and clears its timer', async () => {
  const env = featureRuntime([], command => { assert.equal(command, 'pc_status'); return { cpuPercent: 7, ramUsedBytes: 41, ramTotalBytes: 100, diskUsedBytes: 27, diskTotalBytes: 100, diskFreeBytes: 73, networkConnected: true }; }), Component = env.load('components/PcStatus').PcStatus;
  env.render(Component, { compact: true, refreshMs: 5000 }); await settle();
  const markup = renderToStaticMarkup(env.render(Component, { compact: true, refreshMs: 5000 }));
  assert.match(markup, /CPU %7/); assert.match(markup, /RAM %41/); assert.match(markup, /Disk %27/); assert.match(markup, /İnternet bağlı/);
  assert.equal(env.calls.length, 1); assert.equal([...env.timers.values()][0].interval, 5000); env.dispose(); assert.equal(env.timers.size, 0);
});
test('dashboard markup puts AI and daily work before recent/projects/shortcuts and PC, without management filters', () => {
  const env = featureRuntime([], () => { throw new Error('SSR must not invoke backend'); }, true), Dashboard = env.load('components/Dashboard').Dashboard;
  const markup = renderToStaticMarkup(React.createElement(Dashboard, { projects: [], refreshMs: 2500, onNavigate: () => {}, onAskAi: () => {}, onOpenSearch: () => {} }));
  const sections = ['dashboard-ai-heading', 'dashboard-today-heading', 'dashboard-continue-heading', 'dashboard-projects-heading', 'dashboard-quick-heading', 'dashboard-pc'];
  const positions = sections.map(section => markup.indexOf(section)); assert.ok(positions.every(position => position >= 0)); assert.deepEqual(positions.slice().sort((a, b) => a - b), positions);
  assert.ok(!markup.includes('task-filters')); assert.ok(!markup.includes('Tarihsiz</button>')); assert.ok(!markup.includes('task-editor')); assert.ok(!markup.includes('project-delete')); assert.equal(env.calls.length, 0);
});
