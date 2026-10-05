import test from 'node:test';
import assert from 'node:assert/strict';
import { setupModules } from './helpers.mjs';
const key = name => `ack-deck.${name}.v1`;
const task = { id: 't', text: 'SD kart al', completed: false, dueDate: '2026-10-04', dueTime: '14:00', priority: 'normal', reminder: false };
const project = { id: 'p', name: 'Katip', description: '', folderPath: 'C:\\fixture' };
const archive = { id: 'a', title: 'Fatura', category: 'Fatura', description: 'Eski', date: null, tags: [], file: { path: 'C:\\fixture.pdf', fileName: 'fixture.pdf' }, createdAt: 1, updatedAt: 1 };
const fixture = data => setupModules(Object.entries(data).map(([name, value]) => [key(name), JSON.stringify(value)]));

test('today tasks are real, future/undated tasks excluded; RAM and unrelated chat use minimal sources', async () => {
  const env = fixture({ tasks: [{ ...task, dueDate: new Date().toLocaleDateString('sv-SE') }, { ...task, id: 'future', dueDate: '2099-01-01' }, { id: 'undated', text: 'Private', completed: false }], notes: [{ id: 'n', title: 'Secret note', content: 'Never send', updatedAt: 1 }] });
  const api = env.load('ackIntegration');
  const today = await api.collectAckContext('Bugünkü görevlerim ne?');
  assert.equal(today.context.length, 1); assert.equal(JSON.parse(today.context[0].data).length, 1);
  const pc = await api.collectAckContext('RAM kullanımım nasıl?');
  assert.equal(pc.context.length, 1); assert.equal(pc.context[0].source, 'pc'); assert.equal(env.calls[0].command, 'pc_status');
  const general = await api.collectAckContext("Türkiye'nin başkenti nedir?");
  assert.equal(general.context.length, 0); assert.equal(env.calls.length, 1);
});
test('related search sends only matching projects/tasks/notes/archive and source labels', async () => {
  const env = fixture({ projects: [{ ...project, name: 'Tang Nano 9K' }], tasks: [{ ...task, text: 'Tang Nano SD kart' }], notes: [{ id: 'n', title: 'Tang Nano pinleri', content: 'FPGA', updatedAt: 1 }, { id: 'unrelated', title: 'Private', content: 'Do not send', updatedAt: 1 }], archive: [{ ...archive, title: 'Tang Nano faturası' }] });
  const api = env.load('ackIntegration'); const result = await api.collectAckContext('Tang Nano ile ilgili ne kaydetmişim?');
  assert.deepEqual([...result.context.map(item => item.source).sort()], ['archive', 'notes', 'projects', 'tasks']);
  assert.ok(!JSON.stringify(result.context).includes('Do not send'));
  assert.equal(env.calls.length, 0); assert.equal(api.SOURCE_LABELS.notes, 'Notlar');
});
test('tomorrow 14:00 reminder is a draft until confirmed and persists actual fields', async () => {
  const env = setupModules(), api = env.load('ackActions');
  const proposal = api.proposeAckAction("Yarın saat 14:00'e SD kart al görevi ekle.", new Date('2026-10-04T12:00:00'));
  assert.equal(proposal.action.text, 'SD kart al'); assert.equal(proposal.action.dueDate, '2026-10-05'); assert.equal(proposal.action.dueTime, '14:00');
  const reminder = api.proposeAckAction("Yarın saat 14'te SD kart almayı hatırlat.", new Date('2026-10-04T12:00:00'));
  assert.equal(reminder.action.reminder, true); assert.equal(reminder.action.text, 'SD kart al'); assert.equal(env.values.size, 0);
  await assert.rejects(api.executeAckAction(reminder.action, false)); assert.equal(env.values.size, 0);
  await api.executeAckAction(reminder.action, true);
  const saved = JSON.parse(env.values.get(key('tasks')))[0];
  assert.equal(saved.dueDate, '2026-10-05'); assert.equal(saved.dueTime, '14:00'); assert.equal(saved.reminder, true);
});
test('task edits require confirmation and stale cards cannot overwrite an intervening edit', async () => {
  const env = fixture({ tasks: [task] }), api = env.load('ackActions');
  const proposal = api.prepareAckProposal({ type: 'update_task', taskId: 't', dueDate: '2026-10-05', dueTime: '15:30', priority: 'important', reminder: true });
  await assert.rejects(api.executeAckAction(proposal.action, false));
  await api.executeAckAction(proposal.action, true, undefined, undefined, proposal.expected);
  let saved = JSON.parse(env.values.get(key('tasks')))[0]; assert.equal(saved.priority, 'important'); assert.equal(saved.reminder, true);
  const deletion = api.prepareAckProposal({ type: 'delete_task', taskId: 't' });
  env.values.set(key('tasks'), JSON.stringify([{ ...saved, text: 'Changed by user' }]));
  await assert.rejects(api.executeAckAction(deletion.action, true, undefined, undefined, deletion.expected));
  assert.equal(JSON.parse(env.values.get(key('tasks')))[0].text, 'Changed by user');
});
test('project commands resolve registered IDs, await approval and propagate native failure', async () => {
  const env = fixture({ projects: [project] }), api = env.load('ackActions');
  const proposal = api.proposeAckAction("Katip'i VS Code'da aç."); assert.equal(proposal.action.mode, 'vscode'); assert.equal(env.calls.length, 0);
  await assert.rejects(api.executeAckAction(proposal.action, false));
  await assert.rejects(api.executeAckAction(proposal.action, true, async () => { throw new Error('missing'); }));
  assert.equal(env.calls.length, 0);
  await api.executeAckAction(proposal.action, true); assert.equal(env.calls[0].command, 'open_project_in_vscode'); assert.equal(env.calls[0].args.path, project.folderPath);
});
test('note and archive CRUD is confirmed, linked files preserved and never touched', async () => {
  const env = fixture({ archive: [archive] }), api = env.load('ackActions');
  const note = api.proposalFromTool({ name: 'create_note', args: { title: 'Pinler', content: 'Yeni içerik' } }, 'Yeni not oluştur');
  await assert.rejects(api.executeAckAction(note.action, false)); assert.equal(env.values.has(key('notes')), false);
  await api.executeAckAction(note.action, true);
  const id = JSON.parse(env.values.get(key('notes')))[0].id;
  const update = api.prepareAckProposal({ type: 'update_note', noteId: id, content: 'Değişen içerik' }); assert.match(update.question, /tamamı/);
  await api.executeAckAction(update.action, true, undefined, undefined, update.expected);
  assert.equal(JSON.parse(env.values.get(key('notes')))[0].content, 'Değişen içerik');
  await api.executeAckAction({ type: 'delete_note', noteId: id }, true);
  assert.equal(JSON.parse(env.values.get(key('notes'))).length, 0);
  await api.executeAckAction({ type: 'update_archive', archiveId: 'a', description: 'Yeni' }, true);
  assert.deepEqual(JSON.parse(env.values.get(key('archive')))[0].file, archive.file);
  await api.executeAckAction({ type: 'create_archive', title: 'Garanti', category: 'Garanti', description: 'Yerel', tags: ['laptop'] }, true);
  assert.equal(JSON.parse(env.values.get(key('archive'))).length, 2);
  await assert.rejects(api.executeAckAction({ type: 'delete_archive', archiveId: 'a' }, false));
  await api.executeAckAction({ type: 'delete_archive', archiveId: 'a' }, true);
  assert.equal(JSON.parse(env.values.get(key('archive'))).length, 1); assert.equal(env.calls.length, 0);
});
test('invalid tool parameters, arbitrary paths/shell and secret-shaped data have no effects', async () => {
  const env = setupModules(), api = env.load('ackActions');
  const invalid = [{ type: 'execute_command', command: 'anything' }, { type: 'read_file', path: 'C:\\anything' }, { type: 'create_task', text: 'test', dueDate: '2026-02-30' }, { type: 'create_task', text: 'test', reminder: 'true' }, { type: 'create_task', text: 'test', priority: 'urgent' }, { type: 'open_project', projectId: 'p', mode: 'folder', path: 'C:\\anything' }, { type: 'create_archive', title: 'test', description: '', category: 'Unknown' }, { type: 'create_note', title: 'test', content: 'AI' + 'za' + 'x'.repeat(35) }];
  for (const action of invalid) await assert.rejects(api.executeAckAction(action, true));
  assert.throws(() => api.proposalFromTool({ name: 'create_task', args: { type: 'navigate', text: 'x' } }, 'test'));
  assert.equal(env.values.size, 0); assert.equal(env.calls.length, 0);
});
test('local navigation has no confirmation; speed start requires explicit approval', async () => {
  const env = setupModules(), api = env.load('ackActions'), destinations = [];
  const navigate = target => destinations.push(target);
  const nav = api.proposeAckAction('QR aracını aç.'); await api.executeAckAction(nav.action, false, undefined, navigate); assert.equal(destinations[0].page, 'qr');
  const speed = api.proposeAckAction('İnternetimi test et.');
  await assert.rejects(api.executeAckAction(speed.action, false, undefined, navigate)); assert.equal(destinations.length, 1);
  await api.executeAckAction(speed.action, true, undefined, navigate); assert.equal(destinations[1].intent, 'start-speed'); assert.equal(env.calls.length, 0);
});
test('context redacts key-shaped values and failed storage never reports action success', async () => {
  const synthetic = 'AI' + 'za' + 'x'.repeat(35);
  const env = fixture({ tasks: [{ ...task, text: synthetic }] });
  const result = await env.load('ackIntegration').collectAckContext('Görevlerim neler?');
  assert.ok(!JSON.stringify(result.context).includes(synthetic));
  const blocked = setupModules([], { failWrite: () => true });
  await assert.rejects(blocked.load('ackActions').executeAckAction({ type: 'create_task', text: 'Test' }, true)); assert.equal(blocked.values.size, 0);
});
test('system storage probe cleans up only its own key and handles denied access', () => {
  const env = setupModules([['user-data', 'preserved']]);
  assert.equal(env.load('systemCheck').storageAvailable(), true); assert.deepEqual([...env.values], [['user-data', 'preserved']]);
  const denied = setupModules([['user-data', 'preserved']], { failWrite: () => true });
  assert.equal(denied.load('systemCheck').storageAvailable(), false); assert.equal(denied.values.get('user-data'), 'preserved');
});
