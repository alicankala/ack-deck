import test from 'node:test';
import assert from 'node:assert/strict';
import {setupModules} from './helpers.mjs';
const attachment={id:'audio-123',name:'ses.ogg',mime:'audio/ogg',size:2048};
const note={id:'n',title:'Toplantı',content:'Kısa açıklama',updatedAt:1,attachments:[attachment]};
test('notes retain managed attachments and backups accept old notes plus validated attachment references',()=>{
  const env=setupModules([['ack-deck.notes.v1',JSON.stringify([note])]]),notes=env.load('notesStore'),api=env.load('backupStore');
  assert.equal(notes.loadNotes().notes[0].attachments[0].id,attachment.id);
  const backup=api.createBackup({closeToTray:false,startInTray:false,autoStart:false},'1.1.2');
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseBackup(JSON.stringify(backup)).data.notes)),[note]);
  for(const invalid of [{...attachment,id:'../file'},{...attachment,path:'C:\\private'},{...attachment,mime:'text/html'},{...attachment,size:10*1024*1024+1}]){
    backup.data.notes=[{...note,attachments:[invalid]}];assert.throws(()=>api.parseBackup(JSON.stringify(backup)));
  }
  backup.data.notes=[{id:'old',title:'Old',content:'Kept',updatedAt:1}];assert.equal(api.parseBackup(JSON.stringify(backup)).data.notes[0].id,'old');
});
test('damaged attachment metadata locks notes without deleting the original record',()=>{
  const raw=JSON.stringify([{...note,attachments:[{...attachment,id:'..'}]}]),env=setupModules([['ack-deck.notes.v1',raw]]);
  assert.ok(env.load('notesStore').loadNotes().error);assert.equal(env.values.get('ack-deck.notes.v1'),raw);
});
