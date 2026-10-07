import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
import {posix} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
let mf,db,kv,owner,phone,deviceId,env,worker,reminders,security,shared;
let providerStatus=201;const outbound=[];
const root=new URL('../',import.meta.url),ownerSecret='local-test-owner-'+ 'x'.repeat(48);
async function module(path){const result=await build({entryPoints:[fileURLToPath(new URL(path,root))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
async function call(path,body,token=ownerSecret,method=body===undefined?'GET':'POST',headers={}){const response=await mf.dispatchFetch('https://ack.example/api/'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'X-ACKDeck-Schema':'3',...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch{}return{response,data};}
const task=(text='SD kart al',due=Date.now()+600000)=>({text,completed:false,dueDate:'2026-10-05',dueTime:'14:00',priority:'normal',reminder:true,dueAt:due,timezone:'Europe/Istanbul'});
const mutation=(kind,id,data,baseVersion=0,deleted=false,mutationId=crypto.randomUUID())=>({mutationId,kind,id,baseVersion,data,deleted});
test('project metadata is additive, idempotent, path-free, versioned and invisible to old clients',async()=>{
  const project={name:'ACKDeck',description:'Ürün',nextStep:'Telefon testi',workspaceId:'workspace-1',inboxIds:['incoming-1']};
  const create=mutation('projects','product-project',project);
  assert.equal((await call('mutations',create,phone)).response.status,200);
  assert.equal((await call('mutations',create,phone)).data.record.version,1);
  assert.deepEqual((await call('sync?cursor=0',undefined,phone)).data.records.find(r=>r.id==='product-project').data,project);
  assert.ok(!(await call('sync?cursor=0',undefined,phone,'GET',{'X-ACKDeck-Schema':'2'})).data.records.some(r=>r.kind==='projects'));
  assert.equal((await call('mutations',mutation('projects','bad-path',{...project,nextStep:'C:\\Users\\private'}),phone)).response.status,400);
  assert.equal((await call('mutations',mutation('projects','bad-field',{...project,folderPath:'C:/private'}),phone)).response.status,400);
  assert.equal((await call('mutations',mutation('projects','product-project',{...project,nextStep:'Yeni'},0),phone)).data.conflict,true);
  assert.equal((await call('mutations',mutation('projects','product-project',null,1,true),phone)).data.record.deleted,true);
  assert.equal((await call('mutations',mutation('projects','product-project',project,1),phone)).data.record.deleted,true);
});
test('schema-2 edits retain checklist, links, reminder lead and note attachments without exposing them to legacy clients',async()=>{
  const extra={projectId:'product-project',workspaceId:'workspace-1',sourceInboxId:'incoming-1',checklist:[{id:'step-1',text:'Test',completed:true}],reminderLeadMinutes:60};
  const original={...task('Ürün görevi'),...extra};
  await call('mutations',mutation('tasks','product-task',original));
  const response=await call('mutations',mutation('tasks','product-task',{...task('Eski telefondan düzenlendi'),dueAt:original.dueAt},1),phone,'POST',{'X-ACKDeck-Schema':'2'});
  assert.equal(response.response.status,200);assert.equal('checklist' in response.data.record.data,false);
  const stored=(await call('sync?cursor=0')).data.records.find(r=>r.id==='product-task').data;
  assert.deepEqual(stored.checklist,extra.checklist);assert.equal(stored.projectId,extra.projectId);assert.equal(stored.reminderLeadMinutes,60);
  assert.equal((await db.prepare('SELECT due_at FROM reminders WHERE task_id=?').bind('product-task').first()).due_at,original.dueAt-3600000);
  const attachment={id:'audio-1',name:'Ses.ogg',mime:'audio/ogg',size:100};
  await call('mutations',mutation('notes','product-note',{title:'Ses',content:'Özet',updatedAt:1,projectId:'product-project',attachments:[attachment]}));
  const changed=await call('mutations',mutation('notes','product-note',{title:'Düzenlendi',content:'Korundu',updatedAt:2},1),phone,'POST',{'X-ACKDeck-Schema':'2'});
  assert.equal('attachments' in changed.data.record.data,false);
  const note=(await call('sync?cursor=0')).data.records.find(r=>r.id==='product-note').data;
  assert.deepEqual(note.attachments,[attachment]);assert.equal(note.projectId,'product-project');
  await call('mutations',mutation('tasks','product-task',null,2,true));
});
before(async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('src/index.ts',root))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const bindings={OWNER_SECRET:ownerSecret,VAPID_PUBLIC_KEY:Buffer.from(await webcrypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url'),VAPID_PRIVATE_KEY:(await webcrypto.subtle.exportKey('jwk',keys.privateKey)).d,VAPID_SUBJECT:'mailto:test@example.invalid'};
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-10-04',d1Databases:['DB'],kvNamespaces:['ATTACHMENTS'],bindings,outboundService:async request=>{outbound.push({url:request.url,method:request.method,encoding:request.headers.get('content-encoding'),size:(await request.arrayBuffer()).byteLength});return new Response('',{status:providerStatus,headers:providerStatus===302?{Location:'https://attacker.example/'}:{}});},telemetry:{enabled:false},logRequests:false}));
  db=await mf.getD1Database('DB');kv=await mf.getKVNamespace('ATTACHMENTS');await db.exec(readFileSync(new URL('migrations/0001_phone.sql',root),'utf8'));
  await db.exec(readFileSync(new URL('migrations/0002_inbox_expiry.sql',root),'utf8'));
  await db.prepare("INSERT INTO records(kind,id,version,data,deleted,updated_at) VALUES('notes','migration-preserved',1,?,0,1)").bind(JSON.stringify({title:'Migration fixture',content:'Preserve',updatedAt:1})).run();
  await db.prepare("INSERT INTO reminder_deliveries(generation,device_id,state,attempts,retry_at) VALUES('migration-fixture','fixture','sent',1,0)").run();
  await db.exec(readFileSync(new URL('migrations/0003_subscriptions_recurrence.sql',root),'utf8').replace(/^--.*$/gm,''));
  await db.exec(readFileSync(new URL('migrations/0004_project_metadata.sql',root),'utf8').replace(/^--.*$/gm,''));
  assert.equal((await db.prepare("SELECT data FROM records WHERE id='migration-preserved'").first()).data,JSON.stringify({title:'Migration fixture',content:'Preserve',updatedAt:1}));
  assert.equal((await db.prepare("SELECT state FROM reminder_deliveries WHERE generation='migration-fixture'").first()).state,'sent');
  env={...bindings,DB:db,ATTACHMENTS:kv};worker=await module('src/index.ts');reminders=await module('src/reminders.ts');security=await module('src/security.ts');shared=await module('../shared/phone.ts');
  owner=await call('pair',{});const paired=await call('pair/exchange',{code:owner.data.code,name:'Test iPhone'},null);phone=paired.data.token;deviceId=(await call('me',undefined,phone)).data.id;
});
after(async()=>{await mf?.dispose();});
test('recurring series and subscriptions round-trip, offline retries and tombstones; same Cron continues with PC off',async()=>{
  const rec=await module('../shared/recurrence.ts'),subscriptions=await module('../shared/subscriptions.ts');
  const pair=await call('pair',{}),token=(await call('pair/exchange',{code:pair.data.code,name:'Recurrence test'},null)).data.token;
  const me=(await call('me',undefined,token)).data;
  await db.prepare('INSERT INTO push_subscriptions(device_id,subscription,active,updated_at) VALUES(?,?,1,?)').bind(me.id,'{}',Date.now()).run();
  const yesterday=rec.zonedParts(Date.now()-86400000,'America/New_York').date;
  const rule={frequency:'daily',interval:1,weekdays:[],dayOfMonth:15,start:yesterday,time:'20:00',timezone:'America/New_York',endDate:null,count:null};
  const due=rec.zonedAt(yesterday,'20:00',rule.timezone);
  const data={...task('Tekrarlı vitamin',due),dueDate:yesterday,dueTime:'20:00',timezone:rule.timezone,recurrence:rule,occurrenceAt:due,lastCompletedAt:null,snoozedUntil:null};
  const first=mutation('tasks','recurring-chain',data);assert.equal((await call('mutations',first)).response.status,200);assert.equal((await call('mutations',first)).data.record.version,1);
  await db.prepare('UPDATE desktop_state SET last_seen=0 WHERE id=1').run();
  const sends=[];await reminders.runReminders(env,async(_e,_s,p)=>{sends.push(p);return new Response('',{status:201});});
  assert.equal(sends.filter(p=>p.body==='Tekrarlı vitamin').length,1);
  const scheduled=await db.prepare('SELECT * FROM reminders WHERE task_id=?').bind('recurring-chain').first();assert.ok(scheduled.due_at>Date.now());assert.equal(rec.zonedParts(scheduled.due_at,rule.timezone).time,'20:00');
  await reminders.runReminders(env,async()=>{assert.fail('duplicate recurrence');});
  const complete=rec.completeOccurrence(data);assert.equal(complete.completed,false);
  const changed=await call('mutations',mutation('tasks','recurring-chain',complete,1),token);assert.equal(changed.data.record.data.dueAt,complete.dueAt);
  const synced=(await call('sync?cursor=0')).data.records.find(r=>r.id==='recurring-chain');assert.equal(synced.data.lastCompletedAt,due);
  const legacy=(await call('sync?cursor=0',undefined,ownerSecret,'GET',{'X-ACKDeck-Schema':'1'})).data;
  assert.ok(!legacy.records.some(r=>r.id==='recurring-chain'));
  const oldComplete={...task('Legacy completion'),completed:true};assert.equal((await call('mutations',mutation('tasks','recurring-chain',oldComplete,2))).data.conflict,true);
  const snoozed={...complete,snoozedUntil:Date.now()+3600000,dueAt:Date.now()+3600000};await call('mutations',mutation('tasks','recurring-chain',snoozed,2),token);
  const snoozeRow=await db.prepare('SELECT * FROM reminders WHERE task_id=?').bind('recurring-chain').first();assert.equal(snoozeRow.occurrence_at,complete.occurrenceAt);assert.equal(snoozeRow.due_at,snoozed.snoozedUntil);
  const edited={...snoozed,recurrence:{...rule,interval:2},snoozedUntil:null,dueAt:complete.dueAt};await call('mutations',mutation('tasks','recurring-chain',edited,3));
  await call('mutations',mutation('tasks','recurring-chain',null,4,true));assert.equal((await call('mutations',mutation('tasks','recurring-chain',edited,4),token)).data.conflict,true);assert.equal((await db.prepare('SELECT active FROM reminders WHERE task_id=?').bind('recurring-chain').first()).active,0);
  const sub={id:'subscription-chain',name:'Game Pass',category:'Oyun',amount:12,currency:'USD',cycle:'monthly',periodDays:30,nextPayment:rec.zonedParts(Date.now()+86400000,'Europe/Istanbul').date,autoRenew:true,status:'active',website:'',note:'',icon:'G',reminderDays:0,timezone:'Europe/Istanbul',createdAt:Date.now(),updatedAt:Date.now()};
  const create=mutation('subscriptions',sub.id,sub);assert.equal((await call('mutations',create)).response.status,200);assert.equal((await call('mutations',create)).data.record.version,1);
  assert.ok((await call('sync?cursor=0',undefined,token)).data.records.some(r=>r.id===sub.id&&r.kind==='subscriptions'));
  assert.ok(!(await call('sync?cursor=0',undefined,token,'GET',{'X-ACKDeck-Schema':'1'})).data.records.some(r=>r.kind==='subscriptions'));
  const next=subscriptions.subscriptionReminder(sub);const saved=await db.prepare('SELECT * FROM reminders WHERE task_id=?').bind('subscription:'+sub.id).first();assert.equal(saved.due_at,next.at);
  await db.prepare('UPDATE reminders SET due_at=? WHERE task_id=?').bind(Date.now()-1,'subscription:'+sub.id).run();await reminders.runReminders(env,async(_e,_s,p)=>{sends.push(p);return new Response('',{status:201});});assert.ok(sends.some(p=>p.body.includes('Game Pass')&&p.url==='/#page=subscriptions'));
  await call('mutations',mutation('subscriptions',sub.id,{...sub,status:'paused'},1),token);assert.equal((await db.prepare('SELECT active FROM reminders WHERE task_id=?').bind('subscription:'+sub.id).first()).active,0);
  await call('mutations',mutation('subscriptions',sub.id,null,2,true));assert.equal((await call('mutations',mutation('subscriptions',sub.id,sub,2),token)).data.record.deleted,true);
  await db.prepare('UPDATE devices SET revoked_at=? WHERE id=?').bind(Date.now(),me.id).run();
});
test('strict owner/device auth, same-origin policy and credential-free status',async()=>{
  assert.equal((await call('devices',undefined,null)).response.status,401);
  assert.equal((await call('devices',undefined,'invalid-token-'+ 'y'.repeat(40))).response.status,401);
  assert.equal((await call('pair',{},phone)).response.status,403);
  assert.equal((await call('status',undefined,phone,'GET',{Origin:'https://attacker.example'})).response.status,403);
  const result=await call('status',undefined,phone);assert.equal(result.response.status,200);assert.ok(!JSON.stringify(result.data).includes(ownerSecret));assert.equal(result.response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),null);
});
test('pairing is single-use, expired codes fail, tokens are hashed and revocation disables access/push',async()=>{
  assert.equal((await call('pair/exchange',{code:owner.data.code,name:'Again'},null)).response.status,400);
  const pair=await call('pair',{});await db.prepare('UPDATE pairing_codes SET expires_at=0 WHERE hash=?').bind(await security.hash(pair.data.code)).run();assert.equal((await call('pair/exchange',{code:pair.data.code,name:'Expired'},null)).response.status,400);
  const next=await call('pair',{}),paired=await call('pair/exchange',{code:next.data.code,name:'Revoked'},null),me=await call('me',undefined,paired.data.token);
  const stored=await db.prepare('SELECT token_hash FROM devices WHERE id=?').bind(me.data.id).first();assert.notEqual(stored.token_hash,paired.data.token);
  await call('revoke',{deviceId:me.data.id});assert.equal((await call('status',undefined,paired.data.token)).response.status,401);
});
test('task/note mutations sync both directions, retries deduplicate, tombstones reject stale resurrection',async()=>{
  const id=crypto.randomUUID(),first=mutation('tasks',id,task());const created=await call('mutations',first);assert.equal(created.data.record.version,1);
  assert.equal((await call('mutations',first)).data.record.version,1);
  const sameIdChanged={...first,data:task('Changed payload')};assert.equal((await call('mutations',sameIdChanged)).response.status,409);
  const complete=await call('mutations',mutation('tasks',id,{...task(),completed:true},1),phone);assert.equal(complete.data.record.data.completed,true);
  const stale=await call('mutations',mutation('tasks',id,task('Stale'),1));assert.equal(stale.data.conflict,true);assert.equal(stale.data.record.version,2);
  await call('mutations',mutation('tasks',id,null,2,true));const resurrect=await call('mutations',mutation('tasks',id,task(),2),phone);assert.equal(resurrect.data.conflict,true);assert.equal(resurrect.data.record.deleted,true);
  const noteId=crypto.randomUUID();await call('mutations',mutation('notes',noteId,{title:'Mobil not',content:'FAT32 kullan',updatedAt:Date.now()}),phone);
  const synced=await call('sync?cursor=0');assert.ok(synced.data.records.some(row=>row.id===noteId&&row.data.title==='Mobil not'));assert.ok(synced.data.records.some(row=>row.id===id&&row.deleted));
});
test('record schemas reject arbitrary paths, key fields, invalid dates and oversized text',async()=>{
  for(const data of [{...task(),path:'C:\\secret'},{...task(),dueDate:'2026-99-99'},{...task(),text:'x'.repeat(2001)},{...task(),apiKey:'not-allowed'}])assert.equal((await call('mutations',mutation('tasks',crypto.randomUUID(),data))).response.status,400);
  assert.equal((await call('mutations',{...mutation('tasks',crypto.randomUUID(),task()),run_command:'x'})).response.status,400);
});
test('workspace mirrors contain no targets; only existing IDs create bounded one-time commands',async()=>{
  assert.equal((await call('workspaces',{workspaces:[{id:'w',name:'FPGA',icon:'',description:'',path:'C:\\bad'}]})).response.status,400);
  await call('workspaces',{workspaces:[{id:'w',name:'FPGA',icon:'',description:''}]});
  assert.equal((await call('commands',{workspaceId:'missing',requestId:crypto.randomUUID()},phone)).response.status,404);
  assert.equal((await call('commands',{workspaceId:'w',requestId:crypto.randomUUID(),path:'C:\\bad'},phone)).response.status,400);
  const requestId=crypto.randomUUID(),queued=await call('commands',{workspaceId:'w',requestId},phone);assert.equal(queued.data.offline,true);assert.ok(queued.data.expiresAt-Date.now()<=600000);
  assert.equal((await call('commands/claim',{id:requestId})).response.status,200);assert.equal((await call('commands/claim',{id:requestId})).response.status,409);
  for(const path of ['execute_command','run_powershell','open_path','launch_executable_path'])assert.equal((await call(path,{},phone)).response.status,404);
});
test('safe image/PDF/audio uploads use KV, retain metadata for 30 days, and missing/expired objects are honest',async()=>{
  for(const [name,mime,bytes] of [['test.png','image/png',new Uint8Array([137,80,78,71,13,10,26,10,1])],['test.pdf','application/pdf',new TextEncoder().encode('%PDF-1.7 fixture')],['voice.ogg','audio/ogg',new TextEncoder().encode('OggS fixture')]]){
    const id=crypto.randomUUID();const response=await mf.dispatchFetch('https://ack.example/api/attachments',{method:'POST',headers:{Authorization:'Bearer '+phone,'Content-Type':mime,'X-File-Name':encodeURIComponent(name),'X-Request-Id':id},body:bytes});assert.equal(response.status,200);const data=await response.json();assert.ok(data.expiresAt-Date.now()>29*86400000);
    const row=await db.prepare('SELECT kv_key,size FROM inbox_items WHERE id=?').bind(id).first();assert.ok(row.kv_key.startsWith('inbox:'));assert.equal(row.size,bytes.length);
    assert.equal((await mf.dispatchFetch('https://ack.example/api/attachments/'+id,{headers:{Authorization:'Bearer '+ownerSecret}})).status,200);
    await kv.delete(row.kv_key);assert.equal((await call('attachments/'+id)).response.status,410);
  }
});
test('executables, MIME spoofing and uploads over 10MB are rejected',async()=>{
  for(const [name,mime,body] of [['bad.exe','text/plain',new TextEncoder().encode('MZfake')],['fake.pdf','application/pdf',new TextEncoder().encode('not a pdf')],['large.pdf','application/pdf',new Uint8Array(10*1024*1024+1)]]){
    const response=await mf.dispatchFetch('https://ack.example/api/attachments',{method:'POST',headers:{Authorization:'Bearer '+phone,'Content-Type':mime,'X-File-Name':name,'X-Request-Id':crypto.randomUUID()},body});assert.ok([413,415].includes(response.status));
  }
});
test('push endpoint validation blocks SSRF and standard VAPID encryption works with no private key in payload',async()=>{
  const keys=await webcrypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const subscription={endpoint:'https://web.push.apple.com/test-fixture',expirationTime:null,keys:{p256dh:Buffer.from(await webcrypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};
  assert.equal((await call('push',{...subscription,endpoint:'https://127.0.0.1/private'},phone)).response.status,400);
  assert.equal((await call('push',subscription,phone)).response.status,200);
  await reminders.sendNotification(env,JSON.stringify(subscription),{title:'ACKDeck',body:'Test'},async(url,payload)=>{assert.equal(url,subscription.endpoint);assert.ok(payload.body.byteLength>0);assert.ok(!JSON.stringify(payload).includes(env.VAPID_PRIVATE_KEY));assert.equal(payload.redirect,'manual');return new Response('',{status:201});});
});
test('real workerd push route encrypts and POSTs safely; redirects/auth failures retain subscriptions, only gone expires them',async()=>{
  const reset=()=>db.prepare('DELETE FROM rate_limits WHERE bucket=?').bind('push-test:'+deviceId).run();
  assert.equal((await call('push/test',{},null)).response.status,401);assert.equal((await call('push/test',{})).response.status,403);assert.equal((await call('push/test-device',{deviceId},phone)).response.status,403);
  for(const status of [201,302,403,410]){providerStatus=status;await reset();const before=outbound.length;const result=await call('push/test',{},phone);assert.equal(outbound.length,before+1);const sent=outbound.at(-1);assert.equal(sent.method,'POST');assert.equal(sent.encoding,'aes128gcm');assert.equal(sent.size,4096);assert.ok(sent.url.startsWith('https://web.push.apple.com/'));assert.equal(result.response.status,status===201?200:status===410?410:502);const saved=await db.prepare('SELECT active FROM push_subscriptions WHERE device_id=?').bind(deviceId).first();assert.equal(saved.active,status===410?0:1);if(status===302)assert.equal(result.data.code,'PUSH_REDIRECT_REJECTED');}
  await db.prepare('UPDATE push_subscriptions SET active=1 WHERE device_id=?').bind(deviceId).run();providerStatus=201;
});
test('VAPID verification rejects a mismatched pair before any delivery',async()=>{
  await reminders.verifyVapid(env);const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const wrong=(await webcrypto.subtle.exportKey('jwk',keys.privateKey)).d;await assert.rejects(reminders.verifyVapid({...env,VAPID_PRIVATE_KEY:wrong}));
});
test('cron only sends due active reminders, snooze/completion/revocation suppress sends, and delivery claims deduplicate',async()=>{
  const dueId=crypto.randomUUID(),futureId=crypto.randomUUID(),completedId=crypto.randomUUID(),snoozedId=crypto.randomUUID();
  await call('mutations',mutation('tasks',dueId,task('Due',Date.now()-10000)));
  await call('mutations',mutation('tasks',futureId,task('Future',Date.now()+3600000)));
  await call('mutations',mutation('tasks',completedId,{...task('Completed',Date.now()-10000),completed:true}));
  await call('mutations',mutation('tasks',snoozedId,task('Snoozed',Date.now()-10000)));await call('mutations',mutation('tasks',snoozedId,task('Snoozed',Date.now()+3600000),1));
  const sent=[];await reminders.runReminders(env,async(_env,_sub,data)=>{sent.push(data.body);return new Response('',{status:201});});assert.deepEqual(sent,['Due']);
  await reminders.runReminders(env,async()=>{throw new Error('duplicate dispatch');});assert.equal((await db.prepare("SELECT state FROM reminder_deliveries WHERE generation=? AND device_id=?").bind(dueId+':1',deviceId).first()).state,'sent');
  await call('revoke',{deviceId});await call('mutations',mutation('tasks',crypto.randomUUID(),task('Revoked due',Date.now()-10000)));await reminders.runReminders(env,async()=>{assert.fail('revoked subscription sent');});
});

test('real desktop and mobile sync engines round-trip tasks, notes, completion, offline retry and tombstones through D1',async()=>{
  const pair=await call('pair',{});const token=(await call('pair/exchange',{code:pair.data.code,name:'Sync chain'},null)).data.token;
  const values=new Map([['ack-deck.tasks.v1',JSON.stringify([{id:'chain-task',text:'Masaüstü zincir görevi',completed:false,dueDate:null,dueTime:null,priority:'normal',reminder:false}])],['ack-deck.notes.v1',JSON.stringify([{id:'chain-note',title:'Masaüstü notu',content:'UART',updatedAt:1}])]]),modules={};
  const window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},dispatchEvent:()=>{}};
  function load(path){if(modules[path])return modules[path];const exports={};modules[path]=exports;const source=readFileSync(new URL('../'+path+'.ts',root),'utf8');runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,window,require:name=>name==='@tauri-apps/api/core'?{invoke:async()=>{throw Error('Unexpected native call');}}:load(posix.normalize(posix.join(posix.dirname(path),name))),structuredClone,crypto,URL,TextEncoder,TextDecoder,Intl,Event,Date});return exports;}
  const desktop=load('src/phoneSync'),mobile=await module('../mobile/src/store.ts');
  const desktopRequest=async(operation,body)=>{const path=operation==='mutate'?'mutations':operation==='sync'?'sync?cursor='+body.cursor:operation;return(await call(path,['sync'].includes(operation)?undefined:body??{})).data;};
  const phoneRequest=async(state,path,options={})=>(await call(path,options.body?JSON.parse(options.body):undefined,state.token)).data;
  const persist=async()=>{};
  await desktop.synchronizePhone(desktopRequest);
  let state=await mobile.synchronize({...mobile.emptyState(),token},phoneRequest,persist);
  assert.equal(state.records.find(row=>row.id==='chain-task').data.text,'Masaüstü zincir görevi');assert.equal(state.records.find(row=>row.id==='chain-note').data.content,'UART');
  const localTask={...task('Telefon zincir görevi'),reminder:false,dueAt:null,dueDate:null,dueTime:null};
  state=mobile.enqueue(state,mutation('tasks','chain-phone-task',localTask));state=mobile.enqueue(state,mutation('notes','chain-phone-note',{title:'Telefon zincir notu',content:'FAT32',updatedAt:Date.now()}));
  await assert.rejects(mobile.synchronize(state,async()=>{throw Error('Offline');},persist));assert.equal(state.queue.length,2);
  state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);
  assert.ok(JSON.parse(values.get('ack-deck.tasks.v1')).some(row=>row.id==='chain-phone-task'));assert.ok(JSON.parse(values.get('ack-deck.notes.v1')).some(row=>row.id==='chain-phone-note'));
  const row=state.records.find(item=>item.id==='chain-task');state=mobile.enqueue(state,mutation('tasks',row.id,{...row.data,completed:true},row.version));state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);assert.equal(JSON.parse(values.get('ack-deck.tasks.v1')).find(item=>item.id==='chain-task').completed,true);
  const recurrence=load('shared/recurrence'),today=recurrence.zonedParts(Date.now(),'Europe/Istanbul').date;
  const rule={frequency:'daily',interval:1,weekdays:[],dayOfMonth:15,start:today,time:'20:00',timezone:'Europe/Istanbul',endDate:null,count:null};
  const occurrenceAt=recurrence.zonedAt(today,'20:00',rule.timezone);
  values.set('ack-deck.tasks.v1',JSON.stringify([...JSON.parse(values.get('ack-deck.tasks.v1')),{id:'chain-recurring',text:'Vitamin',completed:false,dueDate:today,dueTime:'20:00',reminder:true,recurrence:rule,occurrenceAt}]));
  await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);
  const recurring=state.records.find(r=>r.id==='chain-recurring');assert.equal(recurring.data.recurrence.frequency,'daily');
  const offline=mobile.enqueue(state,mutation('tasks',recurring.id,recurrence.completeOccurrence(recurring.data),recurring.version));
  await assert.rejects(mobile.synchronize(offline,async()=>{throw Error('Offline');},persist));state=await mobile.synchronize(offline,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);
  let local=JSON.parse(values.get('ack-deck.tasks.v1')).find(t=>t.id===recurring.id);assert.equal(local.completed,false);assert.ok(local.occurrenceAt>occurrenceAt);
  const advanced=recurrence.completeOccurrence(local);values.set('ack-deck.tasks.v1',JSON.stringify(JSON.parse(values.get('ack-deck.tasks.v1')).map(t=>t.id===local.id?advanced:t)));
  await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);assert.equal(state.records.find(r=>r.id===local.id).data.occurrenceAt,advanced.occurrenceAt);
  const subscription={id:'chain-sub',name:'YouTube',category:'Video',amount:100,currency:'TRY',cycle:'monthly',periodDays:30,nextPayment:today,autoRenew:true,status:'active',website:'',note:'',icon:'',reminderDays:1,timezone:rule.timezone,createdAt:1,updatedAt:1};
  load('src/subscriptionStore').saveSubscriptions([subscription]);await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);const sr=state.records.find(r=>r.id===subscription.id);assert.equal(sr.data.name,'YouTube');
  state=mobile.enqueue(state,mutation('subscriptions',sr.id,{...sr.data,amount:120,updatedAt:2},sr.version));state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);assert.equal(load('src/subscriptionStore').loadSubscriptions().entries[0].amount,120);
  const updated=state.records.find(r=>r.id===subscription.id);state=mobile.enqueue(state,mutation('subscriptions',updated.id,null,updated.version,true));state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);assert.equal(load('src/subscriptionStore').loadSubscriptions().entries.length,0);
  values.set('ack-deck.tasks.v1',JSON.stringify(JSON.parse(values.get('ack-deck.tasks.v1')).filter(item=>item.id!=='chain-phone-task')));await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);assert.equal(state.records.find(item=>item.id==='chain-phone-task').deleted,true);
  load('src/projectStore').saveProjects([{id:'chain-project',name:'ACKDeck',description:'Ürün',folderPath:'C:/private/ackdeck',nextStep:'Güncelleme testi',workspaceId:null,shortcutIds:['private-reference'],inboxIds:[]}]);
  const linkedTask=load('src/taskStore').loadTasks();load('src/taskStore').saveTasks(linkedTask.entries.map(t=>t.id==='chain-task'?{...t,completed:false,projectId:'chain-project',checklist:[{id:'chain-step',text:'Telefon testi',completed:false}]}:t),linkedTask);
  const linkedNotes=load('src/notesStore').loadNotes();load('src/notesStore').saveNotes(linkedNotes.notes.map(n=>n.id==='chain-note'?{...n,projectId:'chain-project',attachments:[{id:'chain-voice',name:'Ses.ogg',mime:'audio/ogg',size:100}]}:n));
  await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);
  const projectRow=state.records.find(r=>r.id==='chain-project');assert.equal(projectRow.data.nextStep,'Güncelleme testi');assert.equal('folderPath' in projectRow.data,false);assert.equal('shortcutIds' in projectRow.data,false);
  const checklistRow=state.records.find(r=>r.id==='chain-task');assert.equal(checklistRow.data.checklist[0].id,'chain-step');assert.equal(state.records.find(r=>r.id==='chain-note').data.attachments[0].id,'chain-voice');
  state=mobile.enqueue(state,mutation('projects',projectRow.id,{...projectRow.data,nextStep:'Telefon kontrolü'},projectRow.version));state=mobile.enqueue(state,mutation('tasks',checklistRow.id,{...checklistRow.data,checklist:[{...checklistRow.data.checklist[0],completed:true}]},checklistRow.version));
  await assert.rejects(mobile.synchronize(state,async()=>{throw Error('Offline');},persist));state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);
  const localProject=load('src/projectStore').loadProjects()[0];assert.equal(localProject.nextStep,'Telefon kontrolü');assert.equal(localProject.folderPath,'C:/private/ackdeck');assert.deepEqual(Array.from(localProject.shortcutIds),['private-reference']);assert.equal(load('src/taskStore').loadTasks().entries.find(t=>t.id==='chain-task').checklist[0].completed,true);
  const currentProject=state.records.find(r=>r.id==='chain-project');state=mobile.enqueue(state,mutation('projects',currentProject.id,null,currentProject.version,true));state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);assert.equal(load('src/projectStore').loadProjects().length,0);assert.equal(load('src/notesStore').loadNotes().notes.find(n=>n.id==='chain-note').projectId,'chain-project');
});
