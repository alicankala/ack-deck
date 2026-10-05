import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {posix} from 'node:path';
function setup() {
  const values = new Map(), calls = [], modules = {};
  const native = async (command, args) => { calls.push({ command, args }); return { cpu: 12 }; };
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = {}; modules[name] = exports;
    const source = ts.transpileModule(readFileSync(new URL('../src/' + name + '.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, require: id => id === '@tauri-apps/api/core' ? { invoke: native } : load(posix.normalize(posix.join(posix.dirname(name),id))), setTimeout, clearTimeout, crypto: { randomUUID: () => 'created-task' }, window: { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } } });
    return exports;
  }
  return { api: load('ackIntegration'), values, calls, native };
}
test('only requested sources are read; unrelated chat has no local context', async () => {
  const { api, values, calls } = setup();
  values.set('ack-deck.tasks.v1', JSON.stringify([{ id: 't', text: 'Actual task', completed: false }]));
  const tasks = await api.collectAckContext('Görevlerim neler?');
  assert.equal(tasks.context.length, 1); assert.equal(JSON.parse(tasks.context[0].data)[0].text, 'Actual task');
  const pc = await api.collectAckContext('PC durumum nasıl?');
  assert.equal(pc.context[0].source, 'pc'); assert.equal(calls[0].command, 'pc_status');
  const general = await api.collectAckContext('Türkiye’nin başkenti neresi?');
  assert.equal(general.context.length, 0); assert.equal(calls.length, 1);
});
test('task proposals have no effects until explicit approval; completion persists', async () => {
  const { api, values } = setup();
  const proposal = api.proposeAckAction('Yarın SD kart almayı görevlerime ekle.', new Date('2026-10-04T12:00:00'));
  assert.equal(proposal.action.text, 'SD kart al'); assert.equal(proposal.action.dueDate, '2026-10-05'); assert.equal(values.size, 0);
  await assert.rejects(api.executeAckAction(proposal.action, false)); assert.equal(values.size, 0);
  await api.executeAckAction(proposal.action, true);
  assert.equal(JSON.parse(values.get('ack-deck.tasks.v1'))[0].completed, false);
  const done = api.proposeAckAction('Yarın SD kart al görevini tamamla');
  await api.executeAckAction(done.action, true);
  assert.equal(JSON.parse(values.get('ack-deck.tasks.v1'))[0].completed, true);
});
test('project opening requires approval and resolves only a stored project ID', async () => {
  const { api, values, calls, native } = setup();
  values.set('ack-deck.projects.v1', JSON.stringify([{ id: 'p', name: 'Katip', description: '', folderPath: 'C:\\fixture' }]));
  const proposal = api.proposeAckAction("Katip projesini VS Code'da aç");
  assert.equal(calls.length, 0);
  await assert.rejects(api.executeAckAction(proposal.action, false, native)); assert.equal(calls.length, 0);
  await api.executeAckAction(proposal.action, true, native);
  assert.equal(calls[0].command, 'open_project_in_vscode'); assert.equal(calls[0].args.path, 'C:\\fixture');
  await assert.rejects(api.executeAckAction({ type: 'execute_command', command: 'anything' }, true, native));
  await assert.rejects(api.executeAckAction({ type: 'open_project', projectId: 'unknown', mode: 'folder' }, true, native));
  assert.equal(calls.length, 1);
});
test('unreadable sources fail gracefully and secret-shaped text is redacted', async () => {
  const { api, values } = setup(); values.set('ack-deck.tasks.v1', 'invalid');
  const result = await api.collectAckContext('Görevlerim neler?');
  assert.equal(result.context.length, 0); assert.equal(result.warnings.length, 1);
  const synthetic = 'AI' + 'za' + 'x'.repeat(35);
  assert.equal(api.redactSecrets(synthetic), '[gizli anahtar]');
  await assert.rejects(api.executeAckAction({ type: 'create_task', text: 'test' }, true));
  assert.equal(values.get('ack-deck.tasks.v1'), 'invalid');
});
test('project context includes only related note and archive snippets', async () => {
  const { api } = setup(); const calls = [];
  const result = await api.collectAckContext('Tang Nano projesi hakkında ne kaydetmişim?', {
    ...api.ackReadTools,
    get_projects: () => [{ id: 'p', name: 'Tang Nano', folderPath: 'C:\\fixture' }],
    get_notes: query => { calls.push(query); return [{ title: 'Tang Nano', content: 'Related note' }]; },
    get_archive_entries: query => { calls.push(query); return [{ title: 'Tang Nano receipt' }]; },
  });
  assert.equal(result.context.length, 3); assert.deepEqual(calls, ['Tang Nano', 'Tang Nano']);
});
test('local IP requests do not fetch public IP implicitly', async () => {
  const { api, calls } = setup();
  await api.collectAckContext('Yerel IP bilgisi nedir?');
  assert.equal(calls.length, 1); assert.equal(calls[0].command, 'local_ip_info');
  await api.collectAckContext('Public IP bilgisi nedir?');
  assert.equal(calls.at(-1).command, 'public_ip_info');
});
test('Turkish possessive source requests work; note listings omit contents unless requested', async () => {
  const { api, values } = setup();
  values.set('ack-deck.projects.v1', JSON.stringify([{ id: 'p', name: 'Katip', description: 'My project', folderPath: '' }]));
  values.set('ack-deck.notes.v1', JSON.stringify([{ id: 'n', title: 'Katip', content: 'Private note body', updatedAt: 1 }]));
  const projects = await api.collectAckContext('Projelerim neler?');
  assert.equal(JSON.parse(projects.context[0].data)[0].name, 'Katip');
  const notes = await api.collectAckContext('Notlarımı göster');
  assert.equal(JSON.parse(notes.context[0].data)[0].content, undefined);
  const summary = await api.collectAckContext('Notlarımı özetle');
  assert.equal(JSON.parse(summary.context[0].data)[0].content, 'Private note body');
});
