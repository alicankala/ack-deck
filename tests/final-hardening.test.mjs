import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { setupModules } from './helpers.mjs';
const desktop = { closeToTray: false, startInTray: false, autoStart: false };
const thread = (id='one') => ({ id, title: 'SD kart', createdAt: 100, updatedAt: 200, messages: [{ role: 'user', text: 'SD kart al' }, { role: 'model', text: 'Görevler', sources: ['tasks'] }] });
test('IndexedDB conversations reopen, continue, rename, search and delete independently', async () => {
  const indexedDB = new IDBFactory(), env = setupModules([], { indexedDB }), store = env.load('conversationStore');
  await store.saveConversation(thread()); await store.saveConversation(thread('two'));
  const reopened = await setupModules([], { indexedDB }).load('conversationStore').loadConversations(); assert.equal(reopened.length, 2);
  const continued = { ...reopened[0], title: 'Kart hatırlatma', updatedAt: 300, messages: [...reopened[0].messages, { role: 'user', text: 'Yarın hatırlat' }] };
  await store.saveConversation(continued); const all = await store.loadConversations(); assert.equal(all[0].messages.length, 3);
  assert.equal(store.searchConversations(all, 'HATIRLAT')[0].title, 'Kart hatırlatma'); assert.equal(env.calls.length, 0);
  await store.deleteConversation(continued.id); assert.equal((await store.loadConversations()).length, 1);
});
test('history persists visible fields and attachment metadata only, with secret redaction', async () => {
  const api = setupModules([], { indexedDB: new IDBFactory() }).load('conversationStore');
  const secret = 'AI'+'za'+'x'.repeat(35), item = thread(); item.messages.push({ role:'user', text: secret, hiddenPrompt: 'hidden', pendingAction: { target: 'never store' }, attachments:[{name:'fixture.png',mime:'image/png',size:123, bytes:'RAW-CONTENTS'}] });
  await api.saveConversation(item); const persisted = JSON.stringify(await api.loadConversations());
  assert.doesNotMatch(persisted, /hidden|pendingAction|RAW-CONTENTS/); assert.equal(persisted.includes(secret), false); assert.match(persisted,/fixture.png/);
  assert.equal(api.isConversation({...thread(),messages:[{role:'system',text:'hidden'}]}),false);
});
test('quota failure never deletes existing conversations', async () => {
  const api = setupModules([], { indexedDB: new IDBFactory() }).load('conversationStore'); await api.saveConversation(thread());
  const oldPut=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(){throw new Error('QuotaExceededError');};
  try { await assert.rejects(api.saveConversation(thread('two'))); } finally { IDBObjectStore.prototype.put=oldPut; }
  assert.equal((await api.loadConversations())[0].id,'one');
});
test('long conversation request is bounded while local history remains intact', () => {
  const api=setupModules().load('conversationContext'); const messages=Array.from({length:200},(_,i)=>({role:i%2?'user':'model',text:'ç'.repeat(3000)+i}));
  const bounded=api.boundedConversation(messages); assert.ok(bounded.length<=20); assert.ok(new TextEncoder().encode(bounded.map(m=>m.text).join('')).length<=18000); assert.equal(messages.length,200); assert.equal(bounded.at(-1).text,messages.at(-1).text);
  assert.throws(()=>api.boundedConversation([{role:'user',text:'x'.repeat(8001)}]));
});
test('exact page and capture routing is local, and arbitrary intents are not navigation', () => {
  const env=setupModules(), api=env.load('localAiRouting'); assert.equal(api.localAiDestination("QR'ı aç").page,'qr'); assert.equal(api.localAiDestination('Yeni Görev').intent,'new-task'); assert.equal(api.localAiDestination('Yeni Not').intent,'new-note'); assert.equal(api.localAiDestination('Türkiye’nin başkenti nedir?'),null); assert.equal(env.calls.length,0);
});
test('palette AI fallback does not contact Gemini when typing or ranking', () => {
  const env=setupModules(), result=env.load('paletteRows').paletteRows('UART hatası neden olur'); assert.equal(result.rows.at(-1).request.kind,'ai'); assert.equal(env.calls.length,0);
});
test('confirmation is immutable, expires, cancels and can be consumed only once', () => {
  const api=setupModules().load('ackConfirmation'), proposal={action:{type:'create_task',text:'SD kart al'},question:'Eklensin mi?'};
  const pending=api.createConfirmation(proposal,100); proposal.action.text='changed'; assert.equal(pending.action.text,'SD kart al'); assert.equal(api.claimConfirmation(pending,200).action.text,'SD kart al'); assert.throws(()=>api.claimConfirmation(pending,201));
  const expired=api.createConfirmation(proposal,100); assert.throws(()=>api.claimConfirmation(expired,300100));
  const cancelled=api.createConfirmation(proposal); api.cancelConfirmation(cancelled); assert.throws(()=>api.claimConfirmation(cancelled));
  const changed=api.createConfirmation(proposal); changed.action.text='mutated'; assert.throws(()=>api.claimConfirmation(changed));
});
test('narrow search results and result payloads are bounded', async () => {
  const tasks=Array.from({length:100},(_,i)=>({id:String(i),text:'SD kart '+i,completed:false})), env=setupModules([['ack-deck.tasks.v1',JSON.stringify(tasks)]]), api=env.load('ackIntegration');
  const result=await api.collectAckContext('Görevlerim neler?'); assert.ok(JSON.stringify(result.context).length<18000); const data=JSON.parse(result.context[0].data); assert.ok((Array.isArray(data)?data:data.tasks).length<=10);
});
test('explicit attachment selection returns metadata and does not send Gemini', async () => {
  const env=setupModules([], {invoke:command=>command==='choose_ai_attachment'?{id:'selected',name:'fixture.pdf',mime:'application/pdf',size:12}:null}), api=env.load('aiAttachments');
  const selected=await api.chooseAiAttachment(); assert.equal(selected.name,'fixture.pdf'); assert.equal(env.calls.length,1); assert.equal(env.calls[0].command,'choose_ai_attachment'); assert.equal('path' in (env.calls[0].args??{}),false);
});
test('image paste validates type and size before native IPC', async () => {
  const env=setupModules(), api=env.load('aiAttachments'); await assert.rejects(api.pasteAiImage({type:'text/plain',size:10})); await assert.rejects(api.pasteAiImage({type:'image/png',size:9*1024*1024})); assert.equal(env.calls.length,0);
  await api.pasteAiImage({type:'image/png',size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}); assert.equal(env.calls[0].command,'paste_ai_image');
});
test('undo restores only one record and preserves intervening data, and expires', () => {
  const events=[], env=setupModules([['ack-deck.tasks.v1','[]']],{events}), api=env.load('recordUndo'), ticket=api.offerUndo({source:'tasks',record:{id:'deleted',text:'Deleted task',completed:false}});
  env.values.set('ack-deck.tasks.v1',JSON.stringify([{id:'new',text:'New task',completed:false}])); assert.equal(api.undoRecord(ticket.id),true); assert.equal(env.load('taskStore').loadTasks().entries.length,2); assert.equal(api.undoRecord(ticket.id),false);
  const expired=api.offerUndo({source:'tasks',record:{id:'late',text:'Too late',completed:false}}); assert.equal(api.undoRecord(expired.id,expired.expiresAt),false); assert.equal(env.calls.length,0);
});
test('version 2 backup includes visible threads and rejects secret, raw attachment or system prompt fields', () => {
  const api=setupModules().load('backupStore'), backup=api.createBackup(desktop,'0.1.0'); backup.formatVersion=2; backup.data.conversations=[thread()]; backup.data.paletteShortcut='Ctrl+Shift+Space'; assert.equal(api.parseBackup(JSON.stringify(backup)).data.conversations.length,1);
  backup.data.conversations[0].messages[0].attachments=[{name:'fixture.png',mime:'image/png',size:20,contents:'forbidden'}]; assert.throws(()=>api.parseBackup(JSON.stringify(backup))); delete backup.data.conversations[0].messages[0].attachments;
  backup.data.conversations[0].messages.push({role:'system',text:'hidden'}); assert.throws(()=>api.parseBackup(JSON.stringify(backup)));
});
test('cross-storage restore rolls conversation history back with the original snapshot on failure', async () => {
  let failed=false; const indexedDB=new IDBFactory(), env=setupModules([], {indexedDB, failWrite:key=>{if(key==='ack-deck.notes.v1'&&!failed){failed=true;return true;} return false;}}), store=env.load('conversationStore'), api=env.load('backupStore'); await store.saveConversation(thread());
  const backup=api.createBackup(desktop,'0.1.0'); backup.formatVersion=2; backup.data.conversations=[thread('restored')];
  await assert.rejects(api.restoreBackup(backup,true,desktop,env.storage,async()=>[]),/Önceki veriler/); assert.equal((await store.loadConversations())[0].id,'one'); assert.equal(env.values.has('ack-deck.restore-journal.v1'),false);
});
test('successful history restore persists and old backup without history preserves it', async () => {
  const env=setupModules([],{indexedDB:new IDBFactory()}), store=env.load('conversationStore'), api=env.load('backupStore'); await store.saveConversation(thread()); const old=api.createBackup(desktop,'0.1.0'); await api.restoreBackup(old,true,desktop,env.storage,async()=>[]); assert.equal((await store.loadConversations())[0].id,'one');
  const next={...old,formatVersion:2,data:{...old.data,conversations:[thread('new')]}}; await api.restoreBackup(next,true,desktop,env.storage,async()=>[]); assert.equal((await store.loadConversations())[0].id,'new'); await api.recoverPendingRestore(env.storage,async()=>[]); assert.equal((await store.loadConversations())[0].id,'new');
});
test('actual conversation hook keeps the first thread ID stable across asynchronous replies and new chat', async () => {
  const slots=[], effects=[]; let cursor=0;
  const react={useState:initial=>{const index=cursor++; if(!(index in slots)) slots[index]=typeof initial==='function'?initial():initial; return [slots[index], next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},useRef:initial=>{const index=cursor++;return slots[index]??={current:initial};},useEffect:(callback,deps)=>{const index=cursor++; const old=slots[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i]))){slots[index]={deps};effects.push(callback);}}};
  const env=setupModules([],{indexedDB:new IDBFactory(),react}), hook=env.load('useConversations').useConversations, render=()=>{cursor=0;const state=hook();effects.splice(0).forEach(fn=>fn());return state;};
  render(); await new Promise(resolve=>setTimeout(resolve,20)); let state=render(); assert.equal(state.ready,true); const id=state.activeId;
  state.setMessages([{role:'user',text:'Birinci mesaj'}]); state.setMessages(previous=>[...previous,{role:'model',text:'Yanıt'}]); state=render(); assert.equal(state.activeId,id); assert.equal(state.messages.length,2);
  await env.load('conversationStore').flushConversationWrites(); assert.equal((await env.load('conversationStore').loadConversations())[0].messages.length,2);
  state.newChat(); state=render(); assert.notEqual(state.activeId,id); assert.equal(state.messages.length,0); state.select(id); state=render(); assert.equal(state.messages.length,2);
  await state.rename(id,'Yeni başlık'); state=render(); assert.equal(state.current.title,'Yeni başlık');
});
test('full version 2 export includes history, hub records, recent and global shortcut without runtime or credential data', async () => {
  const env=setupModules([['ack-deck.workspaces.v1','[]'],['ack-deck.shortcuts.v1','[]'],['ack-deck.usage.v1','[]'],['ack-deck.recent-items.v1','[]'],['temporary.pending','do not export'],['private.credential','never export']],{indexedDB:new IDBFactory(),invoke:command=>command==='get_palette_shortcut'?'Ctrl+Shift+Space':null}), store=env.load('conversationStore'); await store.saveConversation(thread());
  const result=await env.load('backupStore').createFullBackup(desktop,'0.1.0'); assert.equal(result.formatVersion,2); assert.equal(result.data.conversations.length,1); for(const name of ['workspaces','shortcuts','usage','recent'])assert.ok(name in result.data); assert.equal(result.data.paletteShortcut,'Ctrl+Shift+Space'); assert.doesNotMatch(JSON.stringify(result),/never export|do not export/); assert.equal(env.calls.some(call=>/gemini|credential/.test(call.command)),false);
});
test('crash recovery restores the IndexedDB snapshot together with localStorage', async () => {
  const indexedDB=new IDBFactory(), env=setupModules([],{indexedDB}), store=env.load('conversationStore'), api=env.load('backupStore'); await store.saveConversation(thread()); const old=api.createBackup(desktop,'0.1.0');
  const snapshot=Object.fromEntries(Object.values(api.BACKUP_KEYS).map(key=>[key,null])); env.values.set('ack-deck.restore-journal.v1',JSON.stringify({formatVersion:1,snapshot,desktop,conversations:true})); await store.beginConversationRestore([thread('new')]);
  const restarted=setupModules([...env.values],{indexedDB}); await restarted.load('backupStore').recoverPendingRestore(restarted.storage,async()=>[]); assert.equal((await restarted.load('conversationStore').loadConversations())[0].id,'one'); assert.equal(restarted.values.has('ack-deck.restore-journal.v1'),false);
});
test('palette AI selection hands off the explicit query and no Gemini traffic occurs inside the palette', async () => {
  const events=[], env=setupModules([],{events}), api=env.load('paletteActions'); await api.executePaletteRequest({id:'selected',kind:'ai',value:'UART hatası neden olur'},()=>{},true);
  assert.equal(events[0].type,'ack-ai-question'); assert.equal(events[0].detail,'UART hatası neden olur'); assert.equal(env.calls.length,1); assert.equal(env.calls[0].command,'show_main_window');
});
test('workspace confirmation detects changes in a referenced project before launching', async () => {
  const workspace={id:'w',name:'ACKDeck',description:'',icon:'',createdAt:1,lastUsedAt:0,useCount:0,pinned:false,items:[{id:'item',name:'ACKDeck',type:'project',projectId:'p',mode:'folder'}]}, project={id:'p',name:'ACKDeck',description:'',folderPath:'C:\\fixture'};
  const env=setupModules([['ack-deck.workspaces.v1',JSON.stringify([workspace])],['ack-deck.projects.v1',JSON.stringify([project])]]), actions=env.load('ackActions'), proposal=actions.prepareAckProposal({type:'open_workspace',workspaceId:'w'});
  env.values.set('ack-deck.projects.v1',JSON.stringify([{...project,folderPath:'C:\\changed'}])); await assert.rejects(actions.executeAckAction(proposal.action,true,undefined,undefined,proposal.expected)); assert.equal(env.calls.length,0);
});
test('read-only/native tool timeout is bounded and never returns false success', async () => {
  const api=setupModules().load('aiTimeout'); await assert.rejects(api.withAiTimeout(new Promise(()=>{}),5),/doğrulanamadı/); assert.equal(await api.withAiTimeout(Promise.resolve('success'),100),'success');
});
test('failed history writes cannot be silently omitted from backups after another conversation saves', async () => {
  const store=setupModules([],{indexedDB:new IDBFactory()}).load('conversationStore');
  const original=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(){throw new Error('quota');};
  try { await assert.rejects(store.queueConversationSave(thread())); } finally { IDBObjectStore.prototype.put=original; }
  await store.queueConversationSave(thread('second')); await assert.rejects(store.flushConversationWrites(),/Kaydedilemeyen/);
  await store.queueConversationSave(thread()); await store.flushConversationWrites(); assert.equal((await store.loadConversations()).length,2);
});
test('undo covers notes, archive, workspaces and migrated file shortcuts without changing the real file reference', () => {
  const key=name=>'ack-deck.'+name+'.v1', env=setupModules([[key('files'),JSON.stringify([{id:'legacy',name:'Document',path:'C:\\fixture.pdf',fileName:'fixture.pdf',kind:'file',extension:'pdf',sizeBytes:1,modifiedAt:null}])]],{events:[]}), undo=env.load('recordUndo'), hub=env.load('workHubStore');
  const file=hub.loadShortcuts().entries[0]; assert.equal(hub.removeShortcut(file.id),true); const shortcutTicket=undo.offerUndo({source:'shortcuts',record:file}); assert.equal(undo.undoRecord(shortcutTicket.id),true); assert.equal(hub.loadShortcuts().entries[0].id,'legacy'); assert.equal(JSON.parse(env.values.get(key('files')))[0].path,'C:\\fixture.pdf');
  const noteTicket=undo.offerUndo({source:'notes',record:{id:'note',title:'Note',content:'Content',updatedAt:1}}); assert.equal(undo.undoRecord(noteTicket.id),true); assert.equal(env.load('notesStore').loadNotes().notes.length,1);
  const workspaceTicket=undo.offerUndo({source:'workspaces',record:{id:'workspace',name:'Work',description:'',icon:'',createdAt:1,lastUsedAt:0,useCount:0,pinned:false,items:[]}}); assert.equal(undo.undoRecord(workspaceTicket.id),true);
  const archiveTicket=undo.offerUndo({source:'archive',record:{id:'archive',title:'Invoice',category:'Fatura',description:'',date:null,tags:[],file:null,createdAt:1,updatedAt:1}}); assert.equal(undo.undoRecord(archiveTicket.id),true); assert.equal(env.load('archiveStore').loadArchive().entries.length,1); assert.equal(env.calls.length,0);
});
test('hotkey conflict during restore rolls back safely even when the original shortcut was not registered', async () => {
  const env=setupModules([],{indexedDB:new IDBFactory()}), api=env.load('backupStore'), original=api.createBackup(desktop,'0.1.0'); original.formatVersion=2; original.data.paletteShortcut='Ctrl+Shift+Space'; original.data.conversations=[thread('new')]; await env.load('conversationStore').saveConversation(thread()); const commands=[];
  const native=async(command)=>{commands.push(command);if(command==='get_palette_shortcut_state')return {shortcut:'Ctrl+Alt+Space',registered:false};if(command==='set_palette_shortcut')throw new Error('conflict');return null;};
  await assert.rejects(api.restoreBackup(original,true,desktop,env.storage,native),/Önceki veriler/); assert.ok(commands.includes('restore_unregistered_palette_shortcut')); assert.equal(env.values.has('ack-deck.restore-journal.v1'),false); assert.equal((await env.load('conversationStore').loadConversations())[0].id,'one');
});
test('workspace batch never opens a project changed after the first approved item launches', async () => {
  const workspace={id:'w',name:'ACKDeck',description:'',icon:'',createdAt:1,lastUsedAt:0,useCount:0,pinned:false,items:[{id:'first',name:'First',type:'target',saved:{id:'saved',kind:'url',target:'https://example.com',name:'First'}},{id:'second',name:'Second',type:'project',projectId:'p',mode:'folder'}]}, project={id:'p',name:'Project',description:'',folderPath:'C:\\fixture'};
  const env=setupModules([['ack-deck.workspaces.v1',JSON.stringify([workspace])],['ack-deck.projects.v1',JSON.stringify([project])]]), actions=env.load('ackActions'), proposal=actions.prepareAckProposal({type:'open_workspace',workspaceId:'w'}); const opened=[];
  const result=await actions.executeAckAction(proposal.action,true,async(command,args)=>{opened.push(command);env.values.set('ack-deck.projects.v1',JSON.stringify([{...project,folderPath:'C:\\changed'}]));},undefined,proposal.expected);
  assert.equal(opened.length,1); assert.match(result,/1 öğe açıldı/); assert.match(result,/Second açılamadı/);
});
