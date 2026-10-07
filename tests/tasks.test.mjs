import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { setupModules } from './helpers.mjs';
const source = ts.transpileModule(readFileSync(new URL('../src/taskStore.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(value) { const values = new Map(value ? [['ack-deck.tasks.v1', JSON.stringify(value)]] : []), exports = {}; runInNewContext(source, { exports, require:name=>setupModules().load(name), window: { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, data) => values.set(key, data) } } }); return { api: exports, values }; }
const task = { id: 't', text: 'SD kart al', completed: false };
test('old tasks safely gain optional defaults; invalid calendar/reminder data is preserved', () => {
  const { api, values } = setup([task, { ...task, id: 'bad', dueDate: '2026-02-30' }]);
  const loaded = api.loadTasks(); assert.equal(loaded.entries.length, 1); assert.equal(loaded.entries[0].priority, 'normal');
  assert.equal(api.saveTasks(loaded.entries, loaded), true); assert.equal(JSON.parse(values.get('ack-deck.tasks.v1'))[1].id, 'bad');
  assert.equal(api.isTask({ ...task, reminder: true }), false); assert.equal(api.validTaskTime('24:00'), false);
});
test('date groups include overdue tasks in today and keep completed items separate', () => {
  const { api } = setup(); const items = [task, { ...task, id: 'today', dueDate: '2026-10-04' }, { ...task, id: 'past', dueDate: '2026-10-03' }, { ...task, id: 'future', dueDate: '2026-10-05' }, { ...task, id: 'done', completed: true, dueDate: '2026-10-04' }];
  assert.equal(api.filterTasks(items, 'today', '2026-10-04').length, 2); assert.equal(api.filterTasks(items, 'upcoming', '2026-10-04')[0].id, 'future'); assert.equal(api.filterTasks(items, 'undated')[0].id, 't'); assert.equal(api.filterTasks(items, 'completed')[0].id, 'done');
  assert.deepEqual(Array.from(api.filterTasks(items, 'all'), item => item.id), ['t', 'today', 'past', 'future']);
  assert.equal(api.filterTasks([{ ...task, completed: true }], 'all').length, 0);
  assert.equal(api.filterTasks([{ ...task, completed: true }], 'undated').length, 0);
});
test('rescheduling changes reminder identity and local date/time round trips', () => {
  const { api } = setup(); const scheduled = { ...task, dueDate: '2026-10-05', dueTime: '14:00', reminder: true };
  const date = new Date(api.taskDueAt(scheduled)); assert.equal(date.getHours(), 14); assert.equal(date.getDate(), 5);
  assert.notEqual(api.reminderKey(scheduled), api.reminderKey({ ...scheduled, dueTime: '15:00' })); assert.equal(api.taskDueAt(task), null);
});
