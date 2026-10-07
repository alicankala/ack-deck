import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function setup({ backupFails = false, journal = false, available = true } = {}) {
  const calls = [], events = [], exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/updateClient.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(source, { exports, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, window: { localStorage: { getItem: () => journal ? 'journal' : null }, dispatchEvent: event => events.push(event.detail) }, require: name => name === '@tauri-apps/api/core' ? { isTauri: () => true, invoke: async (command) => { calls.push(command); return command === 'check_update' ? available ? '1.2.0' : null : undefined; } } : name === './desktopClient' ? { getDesktopStatus: async () => ({ version: '1.1.0', preferences: {}, autoStart: false }) } : { createFullBackup: async () => { calls.push('backup'); if (backupFails) throw Error('quota'); return { formatVersion: 2, data: {} }; } } });
  return { client: exports, calls, events };
}
test('checks/downloads once and installs only after a full backup', async () => {
  const { client, calls, events } = setup();
  client.startUpdates(); client.startUpdates();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.updateSnapshot().phase, 'ready');
  assert.deepEqual(calls, ['check_update']);
  await client.installUpdate();
  assert.deepEqual(calls, ['check_update', 'backup', 'install_update']);
  assert.deepEqual(events, [true, false]);
});
test('backup failure prevents installation and permits retry', async () => {
  const { client, calls } = setup({ backupFails: true });
  await client.checkUpdates(); await client.installUpdate();
  assert.deepEqual(calls, ['check_update', 'backup']);
  assert.equal(client.updateSnapshot().phase, 'ready');
  assert.ok(client.updateSnapshot().message);
});
test('unfinished restore prevents update installation', async () => {
  const { client, calls } = setup({ journal: true });
  await client.checkUpdates(); await client.installUpdate();
  assert.deepEqual(calls, ['check_update']);
});
test('manual checks report no new version and permit another check', async () => {
  const { client, calls } = setup({ available: false });
  await client.checkUpdates();
  assert.equal(client.updateSnapshot().phase, 'idle');
  assert.match(client.updateSnapshot().message, /Yeni güncelleme bulunamadı/);
  await client.checkUpdates();
  assert.deepEqual(calls, ['check_update', 'check_update']);
});
