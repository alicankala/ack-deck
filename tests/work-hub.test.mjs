import test from 'node:test';
import assert from 'node:assert/strict';
import { setupModules } from './helpers.mjs';
const key = name => `ack-deck.${name}.v1`;
const workspace = { id: 'w', name: 'FPGA', description: '', icon: '', createdAt: 1, lastUsedAt: 0, useCount: 0, pinned: false, items: [{ id: 'i', name: 'Saved app', type: 'target', saved: { id: 'saved-native-id', name: 'App', kind: 'application', target: 'C:\\fixture.exe' } }, { id: 'p', name: 'Missing project', type: 'project', projectId: 'missing', mode: 'folder' }] };
test('workspaces persist references, launch only saved IDs, and isolate individual failures', async () => {
  const env = setupModules(), store = env.load('workHubStore'); assert.equal(store.saveWorkspaces([workspace]), true);
  assert.equal(setupModules([...env.values]).load('workHubStore').loadWorkspaces().entries[0].name, 'FPGA');
  const result = await env.load('hubLaunch').launchWorkspace('w'); assert.equal(result.opened, 1); assert.equal(result.errors.length, 1);
  assert.deepEqual(Object.keys(env.calls[0].args), ['id']); assert.equal(env.calls[0].args.id, 'saved-native-id');
  assert.equal(store.loadWorkspaces().entries[0].useCount, 1); await assert.rejects(env.load('hubLaunch').launchWorkspace('invented'));
});
test('legacy file shortcuts remain readable, survive editing/removal and preserve original storage', () => {
  const legacy = JSON.stringify([{ id: 'f', name: 'File', path: 'C:\\fixture.txt', fileName: 'fixture.txt', kind: 'file', extension: 'txt', sizeBytes: 10, modifiedAt: null }]);
  const env = setupModules([[key('files'), legacy]]), store = env.load('workHubStore');
  const item = store.loadShortcuts().entries[0]; assert.equal(item.legacy, true);
  assert.equal(store.saveShortcuts([{ ...item, name: 'Renamed' }]), true); assert.equal(store.loadShortcuts().entries[0].name, 'Renamed');
  assert.equal(store.removeShortcut('f'), true); assert.equal(store.loadShortcuts().entries.length, 0); assert.equal(env.values.get(key('files')), legacy);
});
test('changing a legacy shortcut target keeps its ID and original Files data, and launches only the new native ID', async () => {
  const legacy = JSON.stringify([{ id: 'f', name: 'File', path: 'C:\\fixture.txt', fileName: 'fixture.txt', kind: 'file', extension: 'txt', sizeBytes: null, modifiedAt: null }]);
  const env = setupModules([[key('files'), legacy]]), store = env.load('workHubStore'), original = store.loadShortcuts().entries[0];
  const { legacy: _, ...item } = original; assert.equal(store.saveShortcuts([{ ...item, target: 'C:\\new-fixture.txt', savedId: 'new-native-picked-id' }]), true);
  assert.equal(store.loadShortcuts().entries.length, 1); assert.equal(store.loadShortcuts().entries[0].id, 'f'); assert.equal(env.values.get(key('files')), legacy);
  await env.load('hubLaunch').launchShortcut('f'); assert.equal(env.calls[0].command, 'open_saved_target'); assert.deepEqual(Object.keys(env.calls[0].args), ['id']); assert.equal(env.calls[0].args.id, 'new-native-picked-id');
});
test('URL schemes and application IDs are validated; unknown shortcuts never call native launch', async () => {
  const env = setupModules(), store = env.load('workHubStore'); for (const url of ['file:///x', 'javascript:alert(1)', 'https://user:password@example.org', 'bad']) assert.equal(store.validWebUrl(url), false);
  assert.equal(store.validWebUrl('https://example.org'), true);
  assert.equal(store.saveShortcuts([{ id: 's', name: 'App', type: 'application', target: 'C:\\app.exe', description: '', pinned: false, lastUsedAt: 0, useCount: 0 }]), false);
  await assert.rejects(env.load('hubLaunch').launchShortcut('unknown')); assert.equal(env.calls.length, 0);
});
test('ranking respects Turkish exact/prefix/word matches, pins, recency and frequency', () => {
  const env = setupModules(), usage = env.load('usageStore'), base = { pinned: false, lastUsedAt: 0, useCount: 0 };
  assert.equal(usage.normalizeHub('İNDİRİLENLER IŞIK'), 'indirilenler isik');
  const score = (title, data = base) => usage.rankMatch('fpga', title, '', data, 1000);
  assert.ok(score('FPGA') > score('FPGA proje')); assert.ok(score('FPGA proje') > score('Yeni FPGA')); assert.ok(score('Yeni FPGA') > score('XFPGAx'));
  assert.ok(score('FPGA', { ...base, pinned: true }) > score('FPGA')); assert.ok(score('FPGA', { ...base, useCount: 20, lastUsedAt: 1000 }) > score('FPGA'));
  usage.updateUsage('projects', 'p', true, 1000); usage.updateUsage('projects', 'p', undefined, 1000); assert.equal(usage.usageFor('projects', 'p').pinned, true); assert.equal(usage.usageFor('projects', 'p').useCount, 1);
});
test('damaged hub storage blocks writes and preserves original data', () => { const env = setupModules([[key('workspaces'), '{broken']]); assert.equal(env.load('workHubStore').saveWorkspaces([]), false); assert.equal(env.values.get(key('workspaces')), '{broken'); });
test('quick task/note capture uses existing stores, preserves data and makes retries idempotent', () => {
  const old = [{ id: 'old', text: 'Keep', completed: false }], env = setupModules([[key('tasks'), JSON.stringify(old)]]), capture = env.load('quickCapture');
  capture.quickCapture('task', 'SD kart al', 'request-task'); capture.quickCapture('task', 'SD kart al', 'request-task');
  assert.equal(env.load('taskStore').loadTasks().entries.length, 2); assert.equal(env.load('taskStore').loadTasks().entries[0].text, 'Keep');
  capture.quickCapture('note', 'Tang Nano pin notları\nFAT32 kullan', 'request-note'); capture.quickCapture('note', 'Tang Nano pin notları\nFAT32 kullan', 'request-note');
  const notes = env.load('notesStore').loadNotes().notes; assert.equal(notes.length, 1); assert.equal(notes[0].title, 'Tang Nano pin notları'); assert.match(notes[0].content, /FAT32/);
  env.values.set('ack-deck.restore-journal.v1', '{}'); assert.throws(() => capture.quickCapture('task', 'Blocked', 'blocked')); assert.equal(env.load('taskStore').loadTasks().entries.length, 2);
});
test('palette search and empty pinned/recent sections resolve only known records', () => {
  const env = setupModules([[key('workspaces'), JSON.stringify([workspace])]]), rows = env.load('paletteRows');
  env.load('usageStore').updateUsage('workspaces', 'w', true, 1000);
  assert.equal(rows.paletteRows('').rows[0].group, 'Sabitlenenler'); assert.equal(rows.paletteRows('').rows[0].request.value, 'w');
  const found = rows.paletteRows('FPGA').rows.find(v => v.id === 'workspaces:w'); assert.equal(found.request.kind, 'workspace');
  assert.equal(rows.paletteRows('PowerShell arbitrary').rows[0].request.kind, 'ai'); assert.equal(env.calls.length, 0);
});
test('palette navigation cannot implicitly start measurement; arbitrary execution is rejected', async () => {
  const env = setupModules(), actions = env.load('paletteActions');
  assert.throws(() => actions.navigationFromJson(JSON.stringify({ page: 'speed', intent: 'start-speed' })));
  await assert.rejects(actions.executePaletteRequest({ id: 'x', kind: 'execute_command', value: 'cmd' }, () => {})); assert.equal(env.calls.length, 0);
});
test('AI workspace and shortcut actions require confirmation and reject arbitrary paths and stale drafts', async () => {
  const shortcut = { id: 's', name: 'İndirilenler', type: 'folder', target: 'C:\\fixture', savedId: 'native-folder', description: '', pinned: false, lastUsedAt: 0, useCount: 0 };
  const env = setupModules([[key('workspaces'), JSON.stringify([workspace])], [key('shortcuts'), JSON.stringify([shortcut])]]), actions = env.load('ackActions');
  const proposal = actions.proposeAckAction('FPGA çalışmasını aç.'); assert.equal(proposal.action.type, 'open_workspace'); assert.match(proposal.question, /Saved app/);
  await assert.rejects(actions.executeAckAction(proposal.action, false)); assert.equal(env.calls.length, 0);
  const result = await actions.executeAckAction(proposal.action, true, undefined, undefined, proposal.expected); assert.match(result, /açılamadı/); assert.equal(env.calls[0].args.id, 'saved-native-id');
  assert.throws(() => actions.prepareAckProposal({ type: 'open_shortcut', shortcutId: 's', path: 'C:\\arbitrary.exe' }));
  const next = actions.proposeAckAction("İndirilenler'i aç."); assert.equal(next.action.type, 'open_shortcut'); await assert.rejects(actions.executeAckAction(next.action, false));
  env.values.set(key('shortcuts'), JSON.stringify([{ ...shortcut, target: 'C:\\changed' }])); await assert.rejects(actions.executeAckAction(next.action, true, undefined, undefined, next.expected)); assert.equal(env.calls.length, 1);
});
test('AI recent/pinned and workspace context is narrow; general questions contain no hub data', async () => {
  const env = setupModules([[key('workspaces'), JSON.stringify([workspace, { ...workspace, id: 'other', name: 'Private unrelated', items: [] }])]]), integration = env.load('ackIntegration');
  const specific = await integration.collectAckContext('FPGA çalışma alanında neler var?'); assert.equal(specific.context[0].source, 'workspaces'); assert.doesNotMatch(JSON.stringify(specific.context), /Private unrelated|fixture.exe/);
  assert.equal((await integration.collectAckContext('Türkiye’nin başkenti nedir?')).context.length, 0);
  env.load('recentStore').recordRecent('workspaces', 'w'); assert.equal((await integration.collectAckContext('En son neyle uğraşıyordum?')).context[0].source, 'recent');
});
test('failed legacy shortcut removal is atomic and does not hide the original entry', () => {
  const file = { id: 'f', name: 'Keep', path: 'C:\\fixture.txt', fileName: 'fixture.txt', kind: 'file', extension: 'txt', sizeBytes: null, modifiedAt: null };
  const env = setupModules([[key('files'), JSON.stringify([file])]], { failWrite: k => k === key('shortcuts') });
  assert.equal(env.load('workHubStore').removeShortcut('f'), false); assert.equal(env.load('workHubStore').loadShortcuts().entries.length, 1); assert.equal(env.values.has('ack-deck.shortcuts-legacy-hidden.v1'), false);
});
test('new hub backup fields round-trip safely and old backups do not erase them', async () => {
  const desktop = { closeToTray: false, startInTray: false, autoStart: false }, env = setupModules([[key('workspaces'), JSON.stringify([workspace])]]), backup = env.load('backupStore');
  const exported = backup.createBackup(desktop, '0.1.0'); assert.equal(exported.data.workspaces[0].name, 'FPGA');
  env.values.set(key('workspaces'), '[]'); await backup.restoreBackup(exported, true, desktop); assert.equal(env.load('workHubStore').loadWorkspaces().entries.length, 1);
  delete exported.data.workspaces; await backup.restoreBackup(exported, true, desktop); assert.equal(env.load('workHubStore').loadWorkspaces().entries.length, 1);
  assert.throws(() => backup.parseBackup(JSON.stringify({ ...exported, data: { ...exported.data, workspaces: [{ ...workspace, password: 'secret fixture' }] } })));
});
test('dashboard prefers pinned projects and resolves workspace/shortcut recent references', () => {
  const env = setupModules([[key('workspaces'), JSON.stringify([workspace])], [key('projects'), JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, name: 'Project ' + i, description: '', folderPath: '' })))]]);
  env.load('usageStore').updateUsage('projects', 'p4', true); env.load('recentStore').recordRecent('workspaces', 'w');
  const data = env.load('dashboardData').loadDashboardData(); assert.equal(data.recents[0].target.page, 'workspaces'); assert.equal(data.workspaces[0].id, 'w');
  assert.equal(env.load('dashboardData').dashboardProjects(env.load('projectStore').loadProjectSnapshot().entries)[0].id, 'p4');
});
test('AI cannot run scripts from legacy file records or invent target paths', async () => {
  const file = { id: 'f', name: 'Legacy script', path: 'C:\\fixture.cmd', fileName: 'fixture.cmd', kind: 'file', extension: 'cmd', sizeBytes: null, modifiedAt: null };
  const env = setupModules([[key('files'), JSON.stringify([file])]]), actions = env.load('ackActions');
  await assert.rejects(actions.executeAckAction({ type: 'open_shortcut', shortcutId: 'f' }, true)); assert.equal(env.calls.length, 0);
  assert.throws(() => actions.proposalFromTool({ name: 'open_workspace', args: { workspaceId: 'w', executable: 'C:\\cmd.exe' } }, 'open'));
});
