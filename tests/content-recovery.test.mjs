import test from 'node:test';
import assert from 'node:assert/strict';
import { setupModules } from './helpers.mjs';
const key = n => 'ack-deck.' + n + '.v1';
test('deletions persist recovery before removing records; restart restoration preserves attachments and links', () => {
  const note = {id:'n',title:'Başlık',content:'İçerik',updatedAt:1,projectId:'p',attachments:[{id:'a',name:'x.txt',mime:'text/plain',size:3}]};
  const env = setupModules([[key('notes'),JSON.stringify([note])]]), notes = env.load('notesStore');
  assert.equal(notes.saveNotes([]),true);
  const restarted = setupModules([...env.values]), trash = restarted.load('trashStore');
  const t = trash.loadTrash().entries[0]; assert.equal(t.source,'notes');
  assert.equal(trash.restoreTrash(t.id),true);
  const restored = restarted.load('notesStore').loadNotes().notes[0];
  assert.equal(restored.projectId,'p'); assert.equal(restored.attachments[0].id,'a');
  assert.equal(trash.loadTrash().entries.length,0);
});
test('quota or damaged trash blocks deletion without altering active data', () => {
  const tasks = JSON.stringify([{id:'t',text:'Görev',completed:false}]);
  for (const env of [setupModules([[key('tasks'),tasks]],{failWrite:k=>k===key('trash')}),setupModules([[key('tasks'),tasks],[key('trash'),'{bad']])]) {
    const store = env.load('taskStore'); assert.equal(store.saveTasks([],store.loadTasks()),false); assert.equal(env.values.get(key('tasks')),tasks);
  }
});
test('failed active deletion leaves a recovery copy but cannot overwrite an existing record', () => {
  const data=JSON.stringify([{id:'t',text:'Keep',completed:false}]);const env=setupModules([[key('tasks'),data]],{failWrite:k=>k===key('tasks')});
  const store=env.load('taskStore'),trash=env.load('trashStore');assert.equal(store.saveTasks([],store.loadTasks()),false);
  const t=trash.loadTrash().entries[0];assert.equal(trash.trashRecordExists(t),true);assert.equal(trash.restoreTrash(t.id),false);assert.equal(env.values.get(key('tasks')),data);
});
test('expired trash cannot be restored and Undo restoration cannot duplicate a record', () => {
  const env=setupModules([[key('tasks'),JSON.stringify([{id:'t',text:'Görev',completed:false}])]]),store=env.load('taskStore'),trash=env.load('trashStore');
  assert.equal(store.saveTasks([],store.loadTasks()),true);const t=trash.loadTrash().entries[0];
  assert.equal(trash.restoreTrash(t.id,t.deletedAt+trash.TRASH_RETENTION),false);
  assert.equal(trash.restoreTrash(t.id,t.deletedAt+1),true);assert.equal(trash.restoreTrash(t.id,t.deletedAt+2),false);
});
test('legacy shortcut deletion/recovery preserves the original Files store', () => {
  const data=JSON.stringify([{id:'f',name:'Dosya',path:'C:/x.txt',fileName:'x.txt',kind:'file',extension:'txt',sizeBytes:1,modifiedAt:1}]);
  const env=setupModules([[key('files'),data]]),hub=env.load('workHubStore'),trash=env.load('trashStore');
  assert.equal(hub.removeShortcut('f'),true);assert.equal(hub.loadShortcuts().entries.length,0);
  assert.equal(trash.restoreTrash(trash.loadTrash().entries[0].id),true);assert.equal(hub.loadShortcuts().entries.length,1);assert.equal(env.values.get(key('files')),data);
});
const program={id:'p',name:'Ders',startDate:'2026-10-05',endDate:null,timezone:'Europe/Istanbul',active:true,updatedAt:1,sessions:[{id:'s',subject:'Matematik',topic:'',weekdays:[5],time:'19:00',minutes:50}]};
test('study reminders default off, use program timezone and skip delivered sessions', () => {
  const api=setupModules().load('studyReminderStore'),now=Date.parse('2026-10-09T14:00:00Z');
  assert.equal(api.pendingStudyReminders([program],[],[],now).length,0);
  const pref=[{id:'p',leadMinutes:15}],first=api.pendingStudyReminders([program],pref,[],now)[0];
  assert.equal(first.dueAt,Date.parse('2026-10-09T15:45:00Z'));
  const next=api.pendingStudyReminders([program],pref,[first.id+'|'+first.dueAt],now)[0];assert.equal(next.dueAt,first.dueAt+7*86400000);
  assert.equal(api.pendingStudyReminders([{...program,active:false}],pref,[],now).length,0);
  assert.equal(api.pendingStudyReminders([{...program,endDate:'2026-10-09'}],pref,[first.id+'|'+first.dueAt],now).length,0);
});
test('damaged reminder preferences and restore lock preserve existing settings', () => {
  const env=setupModules([[key('study-reminders'),'{bad']]),api=env.load('studyReminderStore');assert.equal(api.saveStudyReminder('p',15),false);assert.equal(env.values.get(key('study-reminders')),'{bad');
  const locked=setupModules([[key('restore-journal'),'{}']]);assert.equal(locked.load('studyReminderStore').saveStudyReminder('p',15),false);
});
