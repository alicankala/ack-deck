import test from 'node:test';
import assert from 'node:assert/strict';
import { setupModules } from './helpers.mjs';
const desktop = { closeToTray: false, startInTray: false, autoStart: false };
const existing = [{ id: 'old', text: 'Keep existing task', completed: false }];
test('backup uses an explicit allowlist, preserves all sources, and rejects secrets/unknown schemas', () => {
  const { load, values } = setupModules([['ack-deck.tasks.v1', JSON.stringify(existing)], ['unrelated.secret', 'never export']]); const api = load('backupStore');
  const backup = api.createBackup(desktop, '0.1.0'); assert.equal(backup.data.tasks[0].id, 'old'); assert.equal(JSON.stringify(backup).includes('never export'), false);
  assert.equal(api.parseBackup(JSON.stringify(backup)).formatVersion, 1);
  assert.throws(() => api.parseBackup(JSON.stringify({ ...backup, formatVersion: 3 })));
  assert.throws(() => api.parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, apiKey: 'forbidden' } })));
  values.set('ack-deck.tasks.v1', JSON.stringify([{ ...existing[0], text: 'AI' + 'za' + 'x'.repeat(35) }])); assert.throws(() => api.createBackup(desktop, '0.1.0'));
});
test('restore requires explicit confirmation and replaces only managed data', async () => {
  const { load, values, storage, calls } = setupModules([['ack-deck.tasks.v1', JSON.stringify(existing)], ['unrelated', 'preserve']]); const api = load('backupStore'), backup = api.createBackup(desktop, '0.1.0'); backup.data.tasks = [{ id: 'new', text: 'Restored task', completed: false }];
  const native = async (command, args) => { calls.push({ command, args }); return []; };
  await assert.rejects(api.restoreBackup(backup, false, desktop, storage, native)); assert.equal(calls.length, 0); assert.equal(JSON.parse(values.get('ack-deck.tasks.v1'))[0].id, 'old');
  await api.restoreBackup(backup, true, desktop, storage, native); assert.equal(JSON.parse(values.get('ack-deck.tasks.v1'))[0].id, 'new'); assert.equal(values.get('unrelated'), 'preserve'); assert.equal(values.has('ack-deck.restore-journal.v1'), false); assert.equal(calls.some((call) => /gemini|credential/.test(call.command)), false);
});
test('partial quota failure rolls every managed key back to the original snapshot', async () => {
  let failed = false; const { load, values, storage } = setupModules([['ack-deck.tasks.v1', JSON.stringify(existing)], ['ack-deck.projects.v1', '[]']], { failWrite: key => { if (key === 'ack-deck.projects.v1' && !failed) { failed = true; return true; } return false; } });
  const api = load('backupStore'), backup = api.createBackup(desktop, '0.1.0'); backup.data.tasks = [];
  await assert.rejects(api.restoreBackup(backup, true, desktop, storage, async () => []), /Önceki veriler/);
  assert.equal(JSON.parse(values.get('ack-deck.tasks.v1'))[0].id, 'old'); assert.equal(values.get('ack-deck.projects.v1'), '[]'); assert.equal(values.has('ack-deck.restore-journal.v1'), false);
});
test('crash journal recovery restores prior local data and native preferences', async () => {
  const { load, values, storage } = setupModules([['ack-deck.tasks.v1', JSON.stringify(existing)]]); const api = load('backupStore');
  const snapshot = Object.fromEntries(Object.values(api.BACKUP_KEYS).map(key => [key, storage.getItem(key)]));
  values.set('ack-deck.restore-journal.v1', JSON.stringify({ formatVersion: 1, snapshot, desktop })); values.set('ack-deck.tasks.v1', '[]');
  let nativeCalls = 0; await api.recoverPendingRestore(storage, async command => { assert.equal(command, 'save_desktop_preferences'); nativeCalls++; });
  assert.equal(nativeCalls, 1); assert.equal(JSON.parse(values.get('ack-deck.tasks.v1'))[0].id, 'old'); assert.equal(values.has('ack-deck.restore-journal.v1'), false);
});
test('failed native rollback retains the recovery journal rather than discarding the original snapshot', async () => {
  const env = setupModules([['ack-deck.tasks.v1', JSON.stringify(existing)]]), api = env.load('backupStore');
  const backup = api.createBackup(desktop, '0.1.0'); backup.data.tasks = [];
  await assert.rejects(api.restoreBackup(backup, true, desktop, env.storage, async command => { if (command === 'save_desktop_preferences') throw new Error('native unavailable'); return []; }), /Kurtarma kaydı/);
  const journal = JSON.parse(env.values.get('ack-deck.restore-journal.v1'));
  assert.equal(journal.snapshot['ack-deck.tasks.v1'], JSON.stringify(existing));
  assert.equal(env.values.get('ack-deck.tasks.v1'), JSON.stringify(existing));
});
test('restore locks UI/reminder registration until success, and failed rollback keeps it locked', async () => {
  const events = [], env = setupModules([], { events }), api = env.load('backupStore');
  const backup = api.createBackup(desktop, '0.1.0');
  let resume; const waiting = new Promise(resolve => { resume = resolve; });
  const restoring = api.restoreBackup(backup, true, desktop, env.storage, async command => { if (command === 'sync_task_reminders') await waiting; return []; });
  assert.equal(events[0].type, 'ack-restore-active'); assert.equal(events[0].detail, true);
  assert.ok(env.values.has('ack-deck.restore-journal.v1'));
  resume(); await restoring;
  assert.equal(events.at(-1).type, 'ack-restore-active'); assert.equal(events.at(-1).detail, false);
  events.length = 0;
  await assert.rejects(api.restoreBackup(backup, true, desktop, env.storage, async () => { throw new Error('unavailable'); }));
  assert.equal(events.at(-1).type, 'ack-restore-blocked'); assert.equal(events.some(event => event.type === 'ack-restore-active' && event.detail === false), false);
});
