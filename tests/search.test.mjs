import test from 'node:test';
import assert from 'node:assert/strict';
import { setupModules } from './helpers.mjs';
test('global search finds all five local sources without native/network calls', () => {
  const { load, values, calls } = setupModules();
  values.set('ack-deck.tasks.v1', JSON.stringify([{ id: 't', text: 'Tang Nano için SD kart al', completed: false }]));
  values.set('ack-deck.projects.v1', JSON.stringify([{ id: 'p', name: 'Tang Nano 9K', description: 'FPGA', folderPath: 'C:\\fixture' }]));
  values.set('ack-deck.notes.v1', JSON.stringify([{ id: 'n', title: 'Pinler', content: 'Tang Nano pin notları', updatedAt: 1 }]));
  values.set('ack-deck.files.v1', JSON.stringify([{ id: 'f', name: 'Tang Nano şema', fileName: 'schema.pdf', path: 'C:\\fixture.pdf', kind: 'file', extension: 'pdf', sizeBytes: 1, modifiedAt: 1 }]));
  values.set('ack-deck.archive.v1', JSON.stringify([{ id: 'a', title: 'Fatura', description: '', category: 'Fatura', tags: ['Tang Nano'], file: null, date: null, createdAt: 1, updatedAt: 1 }]));
  const result = load('localSearch').searchLocal('tang nano'); assert.equal(result.results.length, 5); assert.equal(calls.length, 0);
  assert.equal(load('localSearch').searchLocal('FPGA', ['projects']).results[0].id, 'p');
});
test('malformed sources do not hide healthy local search results', () => {
  const { load, values } = setupModules(); values.set('ack-deck.notes.v1', 'bad'); values.set('ack-deck.tasks.v1', JSON.stringify([{ id: 't', text: 'FPGA', completed: false }]));
  const result = load('localSearch').searchLocal('fpga'); assert.equal(result.results.length, 1); assert.equal(result.warnings.length, 1);
});
test('palette keyboard wraps selection and native project commands resolve only stored IDs', async () => {
  const { load, values, calls } = setupModules(); const api = load('commandPalette');
  values.set('ack-deck.projects.v1', JSON.stringify([{ id: 'p', name: 'Katip', description: '', folderPath: 'C:\\fixture' }]));
  assert.equal(api.moveSelection(0, -1, 4), 3); assert.equal(api.moveSelection(3, 1, 4), 0);
  assert.equal(api.paletteCommands('Katip').length, 2); assert.equal(calls.length, 0);
  await assert.rejects(api.openRegisteredProject('unknown', 'folder')); await assert.rejects(api.openRegisteredProject('p', 'shell')); assert.equal(calls.length, 0);
  await api.openRegisteredProject('p', 'vscode'); assert.equal(calls[0].command, 'open_project_in_vscode'); assert.equal(calls[0].args.path, 'C:\\fixture');
});
