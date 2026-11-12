import test, {before,beforeEach,after} from 'node:test';
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
let providerStatus=201;let geminiHandler=null;const outbound=[];
const root=new URL('../',import.meta.url),ownerSecret='local-test-owner-'+ 'x'.repeat(48);
async function module(path){const result=await build({entryPoints:[fileURLToPath(new URL(path,root))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
async function call(path,body,token=ownerSecret,method=body===undefined?'GET':'POST',headers={}){const response=await mf.dispatchFetch('https://ack.example/api/'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'X-ACKDeck-Schema':'3',...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch{}return{response,data};}
const task=(text='SD kart al',due=Date.now()+600000)=>({text,completed:false,dueDate:'2026-10-05',dueTime:'14:00',priority:'normal',reminder:true,dueAt:due,timezone:'Europe/Istanbul'});
const mutation=(kind,id,data,baseVersion=0,deleted=false,mutationId=crypto.randomUUID())=>({mutationId,kind,id,baseVersion,data,deleted});
test('study program versions, retry and tombstones retain a separate schedule and hide it from schema 1–3 clients',async()=>{
 const data={id:'program-1',name:'Çalışma planı',startDate:'2026-10-05',endDate:null,timezone:'Europe/Istanbul',active:true,updatedAt:1,sessions:[{id:'session-1',subject:'Matematik',topic:'Türev',weekdays:[1,3,5],time:'19:00',minutes:50}]};
 const headers={'X-ACKDeck-Schema':'4'},create=mutation('studyPrograms',data.id,data);
 assert.equal((await call('mutations',create,phone,'POST',headers)).response.status,200);
 assert.equal((await call('mutations',create,phone,'POST',headers)).data.record.version,1);
 assert.deepEqual((await call('sync?cursor=0',undefined,phone,'GET',headers)).data.records.find(r=>r.id===data.id).data,data);
 for(const schema of ['1','2','3'])assert.equal((await call('sync?cursor=0',undefined,phone,'GET',{'X-ACKDeck-Schema':schema})).data.records.some(r=>r.kind==='studyPrograms'),false);
 assert.equal((await call('mutations',mutation('studyPrograms','mismatch',data),phone,'POST',headers)).response.status,400);
 assert.equal((await call('mutations',mutation('studyPrograms','bad-program',{...data,id:'bad-program',sessions:[{...data.sessions[0],weekdays:[8]}]}),phone,'POST',headers)).response.status,400);
 assert.equal((await call('mutations',mutation('studyPrograms',data.id,{...data,name:'Stale'}),phone,'POST',headers)).data.conflict,true);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE task_id=?').bind(data.id).first()).n,0);
 assert.equal((await call('mutations',mutation('studyPrograms',data.id,null,1,true),phone,'POST',headers)).data.record.deleted,true);
 assert.equal((await call('mutations',mutation('studyPrograms',data.id,data,1),phone,'POST',headers)).data.record.deleted,true);
});
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
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-10-04',d1Databases:['DB'],kvNamespaces:['ATTACHMENTS'],bindings,outboundService:async request=>{if(geminiHandler&&request.url.startsWith('https://generativelanguage.googleapis.com/'))return geminiHandler(request);outbound.push({url:request.url,method:request.method,encoding:request.headers.get('content-encoding'),size:(await request.arrayBuffer()).byteLength});return new Response('',{status:providerStatus,headers:providerStatus===302?{Location:'https://attacker.example/'}:{}});},telemetry:{enabled:false},logRequests:false}));
  db=await mf.getD1Database('DB');kv=await mf.getKVNamespace('ATTACHMENTS');await db.exec(readFileSync(new URL('migrations/0001_phone.sql',root),'utf8'));
  await db.exec(readFileSync(new URL('migrations/0002_inbox_expiry.sql',root),'utf8'));
  await db.prepare("INSERT INTO records(kind,id,version,data,deleted,updated_at) VALUES('notes','migration-preserved',1,?,0,1)").bind(JSON.stringify({title:'Migration fixture',content:'Preserve',updatedAt:1})).run();
  await db.prepare("INSERT INTO reminder_deliveries(generation,device_id,state,attempts,retry_at) VALUES('migration-fixture','fixture','sent',1,0)").run();
  await db.exec(readFileSync(new URL('migrations/0003_subscriptions_recurrence.sql',root),'utf8').replace(/^--.*$/gm,''));
  await db.exec(readFileSync(new URL('migrations/0004_project_metadata.sql',root),'utf8').replace(/^--.*$/gm,''));
  await db.exec(readFileSync(new URL('migrations/0005_study_programs.sql',root),'utf8').replace(/^--.*$/gm,''));
  await db.exec(readFileSync(new URL('migrations/0006_prayer_config.sql',root),'utf8').replace(/^--.*$/gm,''));
  await db.exec(readFileSync(new URL('migrations/0007_prayer_logs.sql',root),'utf8').replace(/^--.*$/gm,''));
  await db.exec(readFileSync(new URL('migrations/0008_media_and_attendance.sql',root),'utf8').replace(/^--.*$/gm,''));
  await db.exec(readFileSync(new URL('migrations/0009_study_reminders_and_mobile_ai.sql',root),'utf8').replace(/^--.*$/gm,''));
  await db.exec(readFileSync(new URL('migrations/0010_notification_preferences.sql',root),'utf8').replace(/^--.*$/gm,''));
  const desktopCols=await db.prepare('PRAGMA table_info(desktop_state)').all();
  assert.ok(desktopCols.results.some(c=>c.name==='notification_preferences'),'0010_notification_preferences.sql migration must define desktop_state.notification_preferences');
  assert.equal((await db.prepare("SELECT data FROM records WHERE id='migration-preserved'").first()).data,JSON.stringify({title:'Migration fixture',content:'Preserve',updatedAt:1}));
  assert.equal((await db.prepare("SELECT state FROM reminder_deliveries WHERE generation='migration-fixture'").first()).state,'sent');
  env={...bindings,DB:db,ATTACHMENTS:kv};worker=await module('src/index.ts');reminders=await module('src/reminders.ts');security=await module('src/security.ts');shared=await module('../shared/phone.ts');
  owner=await call('pair',{});const paired=await call('pair/exchange',{code:owner.data.code,name:'Test iPhone'},null);phone=paired.data.token;deviceId=(await call('me',undefined,phone)).data.id;
});
after(async()=>{await mf?.dispose();});
// Each isolated scenario has a fresh request budget; production throttling is unchanged.
beforeEach(async()=>{await db.exec('DELETE FROM rate_limits');await db.prepare('UPDATE desktop_state SET last_seen=0, prayer_config=NULL, study_reminders=NULL').run();});
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
  await call('heartbeat',{prayerConfig:{city:'Karabük',latitude:41.20488,longitude:32.62768,notifyAtTime:true,notifyBeforeMinutes:15}});
  const updatedStatus=await call('status',undefined,phone);assert.equal(updatedStatus.data.prayerConfig.city,'Karabük');
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

test('cron sends prayer notifications when prayer_config is active, routes to /#page=today, and deduplicates',async()=>{
  await db.prepare('UPDATE devices SET revoked_at=NULL WHERE id=?').bind(deviceId).run();
  const keys=await webcrypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const sub={endpoint:'https://web.push.apple.com/test-fixture',expirationTime:null,keys:{p256dh:Buffer.from(await webcrypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};
  await db.prepare('INSERT OR REPLACE INTO push_subscriptions(device_id,subscription,active,updated_at) VALUES(?,?,1,?)').bind(deviceId,JSON.stringify(sub),Date.now()).run();
  await db.exec('DELETE FROM reminders');
  await db.exec('DELETE FROM reminder_deliveries');

  const prayerConfig = {
    city: 'Karabük',
    latitude: 41.20488,
    longitude: 32.62768,
    notifyAtTime: true,
    notifyBeforeMinutes: 15
  };
  await db.prepare('UPDATE desktop_state SET prayer_config=? WHERE id=1').bind(JSON.stringify(prayerConfig)).run();

  const { calculatePrayerTimes } = await import('../../shared/prayerTimes.ts');
  const baseTime = Date.now();
  const dayInfo = calculatePrayerTimes(prayerConfig.latitude, prayerConfig.longitude, new Date(baseTime), prayerConfig.city);
  const fajr = dayInfo.items.find(i => i.name === 'fajr');
  assert.ok(fajr);

  // 1. Early reminder delivery (15 min lead): set now to fajr.timestamp - 15*60*1000 + 1000
  const leadNow = fajr.timestamp - 15 * 60000 + 1000;
  const leadSent = [];
  await reminders.runReminders(env, async (_env, _sub, data) => {
    leadSent.push(data);
    return new Response('', { status: 201 });
  }, leadNow);

  const leadAlert = leadSent.find(s => s.tag === `prayer-lead:15:fajr:${fajr.timestamp}`);
  assert.ok(leadAlert);
  assert.ok(leadAlert.body.includes('15 dakika kaldı'));
  assert.equal(leadAlert.url, '/#page=today');
  // Exact fajr alert shouldn't be sent yet at lead time
  assert.equal(leadSent.filter(s => s.tag === `prayer:fajr:${fajr.timestamp}`).length, 0);

  // 2. Exact time delivery: set now to fajr.timestamp + 1000
  const sent = [];
  await reminders.runReminders(env, async (_env, _sub, data) => {
    sent.push(data);
    return new Response('', { status: 201 });
  }, fajr.timestamp + 1000);

  const fajrAlert = sent.find(s => s.tag === `prayer:fajr:${fajr.timestamp}`);
  assert.ok(fajrAlert);
  assert.equal(fajrAlert.url, '/#page=today');
  assert.ok(fajrAlert.body.includes('İmsak vakti girdi'));

  // 3. Running again at the same moment must deduplicate and NOT send again
  const duplicateSent = [];
  await reminders.runReminders(env, async (_env, _sub, data) => {
    duplicateSent.push(data);
    return new Response('', { status: 201 });
  }, fajr.timestamp + 1000);
  assert.equal(duplicateSent.filter(s => s.tag === `prayer:fajr:${fajr.timestamp}`).length, 0);
});

test('real desktop and mobile sync engines round-trip tasks, notes, completion, offline retry and tombstones through D1',async()=>{
  const pair=await call('pair',{});const token=(await call('pair/exchange',{code:pair.data.code,name:'Sync chain'},null)).data.token;
  const values=new Map([['ack-deck.tasks.v1',JSON.stringify([{id:'chain-task',text:'Masaüstü zincir görevi',completed:false,dueDate:null,dueTime:null,priority:'normal',reminder:false}])],['ack-deck.notes.v1',JSON.stringify([{id:'chain-note',title:'Masaüstü notu',content:'UART',updatedAt:1}])]]),modules={};
  const window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},dispatchEvent:()=>{}};
  function load(path){if(modules[path])return modules[path];const exports={};modules[path]=exports;const source=readFileSync(new URL('../'+path+'.ts',root),'utf8');runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,window,require:name=>name==='@tauri-apps/api/core'?{invoke:async()=>{throw Error('Unexpected native call');}}:name==='adhan'?{Coordinates:class{},CalculationMethod:{Turkey:()=>({})},PrayerTimes:class{}}:load(posix.normalize(posix.join(posix.dirname(path),name))),structuredClone,crypto,URL,TextEncoder,TextDecoder,Intl,Event,Date});return exports;}
  const desktop=load('src/phoneSync'),mobile=await module('../mobile/src/store.ts');
  const desktopRequest=async(operation,body)=>{const path=operation==='mutate'?'mutations':operation==='sync'?'sync?cursor='+body.cursor:operation;const response=await call(path,['sync'].includes(operation)?undefined:body??{},ownerSecret,operation==='sync'?'GET':'POST',{'X-ACKDeck-Schema':'5'});assert.equal(response.response.status,200,JSON.stringify({operation,data:response.data}));return response.data;};
  const phoneRequest=async(state,path,options={})=>(await call(path,options.body?JSON.parse(options.body):undefined,state.token,options.body?'POST':'GET',{'X-ACKDeck-Schema':'5'})).data;
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
  const study={id:'chain-study',name:'Haftalık dersler',startDate:'2026-10-05',endDate:null,timezone:'Europe/Istanbul',active:true,updatedAt:1,sessions:[{id:'chain-session',subject:'Matematik',topic:'Türev',weekdays:[1,3,5],time:'19:00',minutes:50}]};
  assert.equal(load('src/studyProgramStore').saveStudyPrograms([study]),true);await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);
  const studyRow=state.records.find(r=>r.id===study.id);assert.equal(studyRow.data.sessions[0].subject,'Matematik');
  state=mobile.enqueue(state,mutation('studyPrograms',study.id,{...studyRow.data,sessions:[{...studyRow.data.sessions[0],subject:'Fizik'}]},studyRow.version));
  await assert.rejects(mobile.synchronize(state,async()=>{throw Error('Offline');},persist));state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);assert.equal(load('src/studyProgramStore').loadStudyPrograms().entries[0].sessions[0].subject,'Fizik');
  const editedStudy=state.records.find(r=>r.id===study.id);state=mobile.enqueue(state,mutation('studyPrograms',study.id,null,editedStudy.version,true));state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);assert.equal(load('src/studyProgramStore').loadStudyPrograms().entries.length,0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE task_id=?').bind(study.id).first()).n,0);
  const prayerLog={id:'2026-10-21',date:'2026-10-21',prayers:{fajr:'prayed',dhuhr:'prayed',asr:'missed'},notes:[{id:'p-note-1',text:'Şükür namazı kıl',done:false}],updatedAt:1};
  assert.equal(load('src/prayerStore').savePrayerLogs([prayerLog]),true);await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);
  const prayerRow=state.records.find(r=>r.kind==='prayerLogs'&&r.id===prayerLog.id);assert.equal(prayerRow.data.prayers.fajr,'prayed');assert.equal(prayerRow.data.notes[0].text,'Şükür namazı kıl');
  state=mobile.enqueue(state,mutation('prayerLogs',prayerLog.id,{...prayerRow.data,prayers:{...prayerRow.data.prayers,maghrib:'prayed'},notes:[{...prayerRow.data.notes[0],done:true}]},prayerRow.version));
  state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);
  assert.equal(load('src/prayerStore').loadPrayerLogs().entries[0].prayers.maghrib,'prayed');assert.equal(load('src/prayerStore').loadPrayerLogs().entries[0].notes[0].done,true);
  const currentProject=state.records.find(r=>r.id==='chain-project');state=mobile.enqueue(state,mutation('projects',currentProject.id,null,currentProject.version,true));state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);assert.equal(load('src/projectStore').loadProjects().length,0);assert.equal(load('src/notesStore').loadNotes().notes.find(n=>n.id==='chain-note').projectId,'chain-project');
  const movie={id:'chain-movie',type:'movie',title:'Interstellar',status:'completed',rating:9.5,review:'Harika',progress:'',completedDate:'2026-10-28',createdAt:10,updatedAt:10};
  assert.equal(load('src/mediaStore').saveMedia([movie]),true);await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);
  const movieRow=state.records.find(r=>r.kind==='mediaItems'&&r.id==='chain-movie');assert.equal(movieRow.data.title,'Interstellar');
  assert.equal((await call('sync?cursor=0',undefined,token,'GET',{'X-ACKDeck-Schema':'4'})).data.records.some(r=>r.kind==='mediaItems'),false);
  state=mobile.enqueue(state,mutation('mediaItems',movie.id,{...movieRow.data,rating:10,review:'Başyapıt',updatedAt:20},movieRow.version));
  state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);
  assert.equal(load('src/mediaStore').loadMedia().entries[0].review,'Başyapıt');
  load('shared/studyAttendance').setStudyBlockStatus('prog1:sess1:2026-10-28','attended');
  await desktop.synchronizePhone(desktopRequest);state=await mobile.synchronize(state,phoneRequest,persist);
  const attRow=state.records.find(r=>r.kind==='studyAttendance'&&r.id==='2026-10-28');assert.equal(attRow.data.entries['prog1:sess1:2026-10-28'].status,'attended');
  state=mobile.enqueue(state,mutation('studyAttendance','2026-10-28',{id:'2026-10-28',date:'2026-10-28',entries:{'prog1:sess1:2026-10-28':{status:'skipped',at:30}},updatedAt:30},attRow.version));
  state=await mobile.synchronize(state,phoneRequest,persist);await desktop.synchronizePhone(desktopRequest);
  assert.equal(load('shared/studyAttendance').loadStudyAttendance()['prog1:sess1:2026-10-28'].status,'skipped');
});

test('cron delivers study program push when PC is off, skips attended blocks, and mobile AI stores key AES-GCM encrypted',async()=>{
  await db.prepare('UPDATE devices SET revoked_at=NULL WHERE id=?').bind(deviceId).run();
  const keys=await webcrypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const sub={endpoint:'https://web.push.apple.com/test-fixture',expirationTime:null,keys:{p256dh:Buffer.from(await webcrypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};
  await db.prepare('INSERT OR REPLACE INTO push_subscriptions(device_id,subscription,active,updated_at) VALUES(?,?,1,?)').bind(deviceId,JSON.stringify(sub),Date.now()).run();

  const headers={'X-ACKDeck-Schema':'5'};
  // Monday 2026-11-02 18:46 Europe/Istanbul -> 14 min before 19:00 session (within 15-min default lead)
  const prog={id:'cloud-study-1',name:'Vize Planı',startDate:'2026-11-01',endDate:null,timezone:'Europe/Istanbul',active:true,updatedAt:1,sessions:[{id:'s1',subject:'Devre 1',topic:'Thevenin',weekdays:[1],time:'19:00',minutes:50}]};
  assert.equal((await call('mutations',mutation('studyPrograms',prog.id,prog),phone,'POST',headers)).response.status,200);

  const rec=await module('../shared/recurrence.ts');
  const sessionAt=rec.zonedAt('2026-11-02','19:00','Europe/Istanbul');
  const triggerAt=sessionAt - 14 * 60000;
  const sent=[];
  await reminders.runReminders(env,async(_e,_s,p)=>{sent.push(p);return new Response('',{status:201});},triggerAt);
  const studyPush=sent.find(p=>p.tag&&p.tag.startsWith('study:cloud-study-1:s1:2026-11-02'));
  assert.ok(studyPush);
  assert.match(studyPush.body,/Devre 1/);
  assert.equal(studyPush.url,'/#page=today');

  // If block is marked attended, another lesson on the same day is skipped from push
  await call('mutations',mutation('studyAttendance','2026-11-09',{id:'2026-11-09',date:'2026-11-09',entries:{'cloud-study-1:s1:2026-11-09':{status:'attended',at:1}},updatedAt:1}),phone,'POST',headers);
  const nextWeekTrigger=rec.zonedAt('2026-11-09','19:00','Europe/Istanbul') - 14 * 60000;
  const skippedSent=[];
  await reminders.runReminders(env,async(_e,_s,p)=>{skippedSent.push(p);return new Response('',{status:201});},nextWeekTrigger);
  assert.equal(skippedSent.some(p=>p.tag&&p.tag.startsWith('study:cloud-study-1:s1:2026-11-09')),false);

  // 12:30 Dorm Menu push when PC is off (skips fallback, sends real menu once)
  await db.prepare('UPDATE desktop_state SET prayer_config=? WHERE id=1').bind(JSON.stringify({city:'Karabük',latitude:41.20488,longitude:32.62768,notifyAtTime:false,notifyBeforeMinutes:0})).run();
  const noonAt=rec.zonedAt('2026-11-02','12:35','Europe/Istanbul');
  const fallbackSent=[];
  await reminders.runReminders(env,async(_e,_s,p)=>{fallbackSent.push(p);return new Response('',{status:201});},noonAt,async()=>new Response(JSON.stringify({records:[{id:'1',tarih:'2026-11-01',kahvalti:'',aksam:'Eski Menü',yayinda:true}]}),{status:200}));
  assert.equal(fallbackSent.some(p=>p.tag==='dorm-menu:2026-11-02'),false);

  const realMenuSent=[];
  await reminders.runReminders(env,async(_e,_s,p)=>{realMenuSent.push(p);return new Response('',{status:201});},noonAt,async()=>new Response(JSON.stringify({records:[{id:'2',tarih:'2026-11-02',kahvalti:'',aksam:'Mercimek Çorbası\nTavuk Sote\nPirinç Pilavı',yayinda:true}]}),{status:200}));
  const dormPush=realMenuSent.find(p=>p.tag==='dorm-menu:2026-11-02');
  assert.ok(dormPush);
  assert.match(dormPush.body,/Mercimek Çorbası/);

  // Encrypted Mobile AI key provisioning & relay queue
  const fakeKey='test-gemini-cloud-secret-value-123456';
  assert.equal((await call('ai/status',undefined,phone,'GET',headers)).data.configured,false);
  assert.equal((await call('ai/key',{apiKey:fakeKey},ownerSecret,'POST',headers)).response.status,200);
  assert.equal((await call('ai/status',undefined,phone,'GET',headers)).data.configured,true);
  const cipherRow=await db.prepare('SELECT cipher FROM ai_secrets WHERE id=1').first();
  assert.ok(cipherRow&&!cipherRow.cipher.includes(fakeKey));
  assert.ok(!JSON.stringify((await call('status',undefined,phone,'GET',headers)).data).includes(fakeKey));
  assert.equal((await call('ai/key',undefined,ownerSecret,'DELETE',headers)).response.status,200);
  assert.equal((await call('ai/status',undefined,phone,'GET',headers)).data.configured,false);

  // Public media search with IMDb suggestions and cross-type support
  const mediaMod = await module('src/mediaSearch.ts');
  const mockFetcher = async (url) => {
    if (url.includes('breaking%20bad')) {
      return new Response(JSON.stringify({
        d: [{ l: 'Breaking Bad', qid: 'tvSeries', yr: '2008-2013', s: 'Bryan Cranston, Aaron Paul', i: { imageUrl: 'https://m.media-amazon.com/test.jpg' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('interstellar')) {
      return new Response(JSON.stringify({
        d: [{ l: 'Interstellar', qid: 'movie', y: 2014, s: 'Matthew McConaughey, Anne Hathaway', i: { imageUrl: 'https://m.media-amazon.com/test2.jpg' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ d: [] }), { status: 200 });
  };
  const movieQueryForSeries = await mediaMod.searchPublicMedia('movie', 'breaking bad', mockFetcher);
  assert.equal(movieQueryForSeries.length, 1);
  assert.equal(movieQueryForSeries[0].title, 'Breaking Bad');
  assert.equal(movieQueryForSeries[0].suggestedType, 'series');

  const movieQuery = await mediaMod.searchPublicMedia('movie', 'interstellar', mockFetcher);
  assert.equal(movieQuery.length, 1);
  assert.equal(movieQuery[0].title, 'Interstellar');
  assert.equal(movieQuery[0].suggestedType, 'movie');
});


test('/api/dorm-menu serves from KV cache, avoiding redundant Altinkalem fetches', async () => {
  // Pre-seed KV cache with a menu fetched just now
  const records = [{ id: 'test-1', tarih: '2026-11-04', kahvalti: '', aksam: 'Ezogelin\nTavuk\nPilav', yayinda: true }];
  await kv.put('dorm-menu:cache', JSON.stringify({ fetchedAt: Date.now(), records }));

  const initialOutboundCount = outbound.length;
  const res = await mf.dispatchFetch('https://ack.example/api/dorm-menu');
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.cached, true);
  assert.equal(json.records[0].aksam, 'Ezogelin\nTavuk\nPilav');
  // No outbound HTTP fetch to Altinkalem was triggered!
  assert.equal(outbound.length, initialOutboundCount);
});

test('/api/media-rating validates IMDb IDs and serves from KV cache', async () => {
  // 1. Invalid IMDb ID format rejected with 400
  const invalidRes = await mf.dispatchFetch('https://ack.example/api/media-rating?imdbId=invalid');
  assert.equal(invalidRes.status, 400);

  // 2. Pre-seed KV cache with Inception rating
  await kv.put('imdb-rating:tt1375666', '8.8');
  const cachedRes = await mf.dispatchFetch('https://ack.example/api/media-rating?imdbId=tt1375666');
  assert.equal(cachedRes.status, 200);
  const json = await cachedRes.json();
  assert.equal(json.ok, true);
  assert.equal(json.rating, 8.8);
  assert.equal(json.cached, true);
});

test('mobile AI relay round-trip handles TTL, pending queue, failed/done replies, and prevents overwriting completed rows', async () => {
  const headers = { 'X-ACKDeck-Schema': '5' };
  await db.prepare('UPDATE devices SET revoked_at=NULL WHERE id=?').bind(deviceId).run();
  await call('ai/key', {}, ownerSecret, 'DELETE', headers);

  const offlineNoKeyRes = await call(
    'ai/chat',
    { prompt: 'PC kapalı mı?', model: 'fast' },
    phone,
    'POST',
    headers,
  );
  assert.equal(offlineNoKeyRes.response.status, 400);
  assert.equal(
    offlineNoKeyRes.data.error,
    'PC şu an kapalı ve bulut AI anahtarı kayıtlı değil. 7/24 mobil AI kullanmak için bilgisayarında ACKDeck Masaüstü › Ayarlar › Telefon ekranından etkinleştirebilirsin.',
  );

  await call('heartbeat', {});

  const history = [
    { role: 'user', text: 'Selam' },
    { role: 'model', text: 'Merhaba Alican!' },
  ];
  const relayFailInit = await call(
    'ai/chat',
    { prompt: 'Bugün ne yapmalıyım?', history, model: 'powerful' },
    phone,
    'POST',
    headers,
  );
  assert.equal(relayFailInit.response.status, 200);
  assert.equal(relayFailInit.data.ok, true);
  assert.equal(relayFailInit.data.mode, 'relay');
  assert.ok(relayFailInit.data.queryId);

  const row1 = await db.prepare('SELECT created_at, expires_at FROM ai_queries WHERE id=?').bind(relayFailInit.data.queryId).first();
  assert.equal(row1.expires_at - row1.created_at, 150_000);

  const pending1 = await call('ai/pending', undefined, ownerSecret, 'GET', headers);
  assert.equal(pending1.response.status, 200);
  const item1 = pending1.data.queries.find((q) => q.id === relayFailInit.data.queryId);
  assert.ok(item1);
  assert.equal(item1.prompt, 'Bugün ne yapmalıyım?');
  assert.equal(item1.history, JSON.stringify(history));
  assert.equal(item1.model, 'powerful');

  // Legacy { id, error } payload must still be rejected with 400
  const invalidReply = await call('ai/reply', { id: item1.id, error: 'Hata' }, ownerSecret, 'POST', headers);
  assert.equal(invalidReply.response.status, 400);

  // Desktop reports failure via { id, reply, failed: true }
  const failReply = await call(
    'ai/reply',
    { id: item1.id, reply: 'Masaüstünde Gemini API anahtarı ekli değil.', failed: true },
    ownerSecret,
    'POST',
    headers,
  );
  assert.equal(failReply.response.status, 200);
  assert.equal(failReply.data.ok, true);

  const polledFail = await call('ai/query/' + item1.id, undefined, phone, 'GET', headers);
  assert.equal(polledFail.response.status, 200);
  assert.equal(polledFail.data.state, 'failed');
  assert.equal(polledFail.data.reply, 'Masaüstünde Gemini API anahtarı ekli değil.');

  // Late/duplicate reply must NOT overwrite already failed row
  const lateOverwrite = await call('ai/reply', { id: item1.id, reply: 'Geçersiz üzerine yazma' }, ownerSecret, 'POST', headers);
  assert.equal(lateOverwrite.response.status, 200);
  const polledAfterLate = await call('ai/query/' + item1.id, undefined, phone, 'GET', headers);
  assert.equal(polledAfterLate.data.state, 'failed');
  assert.equal(polledAfterLate.data.reply, 'Masaüstünde Gemini API anahtarı ekli değil.');

  // Second query succeeds with 'done' and also ignores late duplicate replies
  const relayDoneInit = await call(
    'ai/chat',
    {
      prompt: 'Derslerim nasıl?',
      messages: [
        { role: 'user', text: 'Selam' },
        { role: 'model', text: 'Merhaba!' },
        { role: 'user', text: 'Derslerim nasıl?' },
      ],
      model: 'fast',
    },
    phone,
    'POST',
    headers,
  );
  assert.equal(relayDoneInit.response.status, 200);
  const qid2 = relayDoneInit.data.queryId;
  const pending2 = await call('ai/pending', undefined, ownerSecret, 'GET', headers);
  const item2 = pending2.data.queries.find((q) => q.id === qid2);
  assert.ok(item2);
  assert.equal(item2.prompt, 'Derslerim nasıl?');
  assert.equal(item2.model, 'fast');
  assert.deepEqual(JSON.parse(item2.history), [
    { role: 'user', text: 'Selam' },
    { role: 'model', text: 'Merhaba!' },
  ]);

  const okReply = await call('ai/reply', { id: qid2, reply: 'Bugün Devre 1 çalışman var.' }, ownerSecret, 'POST', headers);
  assert.equal(okReply.response.status, 200);
  const polledDone = await call('ai/query/' + qid2, undefined, phone, 'GET', headers);
  assert.equal(polledDone.data.state, 'done');
  assert.equal(polledDone.data.reply, 'Bugün Devre 1 çalışman var.');

  await call('ai/reply', { id: qid2, reply: 'Geç gelen hata', failed: true }, ownerSecret, 'POST', headers);
  const polledDoneStable = await call('ai/query/' + qid2, undefined, phone, 'GET', headers);
  assert.equal(polledDoneStable.data.state, 'done');
  assert.equal(polledDoneStable.data.reply, 'Bugün Devre 1 çalışman var.');

  const pendingAfter = await call('ai/pending', undefined, ownerSecret, 'GET', headers);
  assert.equal(pendingAfter.data.queries.some((q) => q.id === item1.id || q.id === qid2), false);
});

test('direct cloud AI usage records fast vs powerful modelTier accurately including fallback', async () => {
  const headers = { 'X-ACKDeck-Schema': '5' };
  const fakeKey = 'test-gemini-cloud-secret-value-123456';
  await db.prepare("DELETE FROM app_settings WHERE key='ai_cloud_usage'").run();
  await call('ai/key', { apiKey: fakeKey }, ownerSecret, 'POST', headers);

  let mode = 'normal';
  geminiHandler = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (mode === 'powerful-fallback' && url.includes('gemini-3.8-flash')) {
      return new Response('upstream error', { status: 503 });
    }
    const label = url.includes('gemini-3.8-flash') ? 'Güçlü yanıt' : 'Hızlı yanıt';
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: label }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    // 1. Fast model increments fast (not powerful!)
    const fastRes = await call('ai/chat', { prompt: 'Hızlı soru', model: 'fast' }, phone, 'POST', headers);
    assert.equal(fastRes.response.status, 200);
    assert.equal(fastRes.data.mode, 'cloud');
    assert.equal(fastRes.data.modelUsed, 'gemini-3.5-flash-lite');

    let usageRow = await db.prepare("SELECT value FROM app_settings WHERE key='ai_cloud_usage'").first();
    let usage = JSON.parse(usageRow.value);
    assert.equal(usage.fast, 1);
    assert.equal(usage.powerful, 0);

    // 2. Powerful model succeeding increments powerful
    const powRes = await call('ai/chat', { prompt: 'Güçlü soru', model: 'powerful' }, phone, 'POST', headers);
    assert.equal(powRes.response.status, 200);
    assert.equal(powRes.data.modelUsed, 'gemini-3.8-flash');

    usageRow = await db.prepare("SELECT value FROM app_settings WHERE key='ai_cloud_usage'").first();
    usage = JSON.parse(usageRow.value);
    assert.equal(usage.fast, 1);
    assert.equal(usage.powerful, 1);

    // 3. Powerful model falling back to fast increments fast
    mode = 'powerful-fallback';
    const fbRes = await call('ai/chat', { prompt: 'Fallback soru', model: 'powerful' }, phone, 'POST', headers);
    assert.equal(fbRes.response.status, 200);
    assert.equal(fbRes.data.modelUsed, 'gemini-3.5-flash-lite');
    assert.equal(fbRes.data.reply, 'Hızlı yanıt');

    usageRow = await db.prepare("SELECT value FROM app_settings WHERE key='ai_cloud_usage'").first();
    usage = JSON.parse(usageRow.value);
    assert.equal(usage.fast, 2);
    assert.equal(usage.powerful, 1);

    // 4. Direct helper return shape includes accurate modelTier
    const mobileAi = await module('src/mobileAi.ts');
    mode = 'normal';
    const directPow = await mobileAi.runCloudMobileAiChat(env, 'Test', [], 'powerful', geminiHandler);
    assert.equal(directPow.modelTier, 'powerful');
    mode = 'powerful-fallback';
    const directFb = await mobileAi.runCloudMobileAiChat(env, 'Test', [], 'powerful', geminiHandler);
    assert.equal(directFb.modelUsed, 'gemini-3.5-flash-lite');
    assert.equal(directFb.modelTier, 'fast');
  } finally {
    geminiHandler = null;
    await call('ai/key', {}, ownerSecret, 'DELETE', headers);
  }
});

test('collectCloudAiContext uses Europe/Istanbul date and serializeBoundedContext prevents mid-JSON truncation over 28 KB', async () => {
  const mobileAi = await module('src/mobileAi.ts');
  const noteIds = [];
  const taskIds = [];
  try {
    // 2026-11-11T22:30:00Z is 2026-11-12 01:30 in Europe/Istanbul (next calendar day vs UTC)
    const lateUtcMs = Date.parse('2026-11-11T22:30:00Z');
    const emptyCtx = JSON.parse(await mobileAi.collectCloudAiContext(env, lateUtcMs));
    assert.equal(emptyCtx.today, '2026-11-12');

    // Insert 15 long notes (> 28 KB combined) + completed & open tasks into D1
    for (let i = 0; i < 15; i++) {
      const id = `bounded-note-${i}`;
      noteIds.push(id);
      await db
        .prepare("INSERT INTO records(kind,id,version,data,deleted,updated_at) VALUES('notes',?,1,?,0,?)")
        .bind(
          id,
          JSON.stringify({ title: `Not ${i}`, content: `Satır ${i} ` + 'A'.repeat(2500), updatedAt: 1000 + i }),
          1000 + i,
        )
        .run();
    }
    const openTaskId = 'bounded-task-open';
    const doneTaskId = 'bounded-task-done';
    taskIds.push(openTaskId, doneTaskId);
    await db
      .prepare("INSERT INTO records(kind,id,version,data,deleted,updated_at) VALUES('tasks',?,1,?,0,?)")
      .bind(openTaskId, JSON.stringify(task('Açık önemli görev')), 2000)
      .run();
    await db
      .prepare("INSERT INTO records(kind,id,version,data,deleted,updated_at) VALUES('tasks',?,1,?,0,?)")
      .bind(doneTaskId, JSON.stringify({ ...task('Tamamlanan görev'), completed: true }), 1900)
      .run();

    const oversizedRaw = await mobileAi.collectCloudAiContext(env, lateUtcMs);
    assert.ok(oversizedRaw.length <= 28000, `Expected <= 28000 chars, got ${oversizedRaw.length}`);
    const parsed = JSON.parse(oversizedRaw);
    assert.equal(parsed.today, '2026-11-12');
    assert.ok(Array.isArray(parsed.notes) && parsed.notes.length > 0);
    assert.ok(parsed.tasks.some((t) => t.text === 'Açık önemli görev'));

    // Direct serializeBoundedContext priority order & extreme single-field guard
    const hugeNotesPayload = {
      today: '2026-11-12',
      tasks: [
        { text: 'Açık görev', completed: false },
        { text: 'Biten görev', completed: true },
      ],
      notes: Array.from({ length: 18 }, (_, idx) => ({
        title: `Uzun Not ${idx}`,
        content: 'B'.repeat(2400),
      })),
      studyPrograms: [{ name: 'Matematik', startDate: '2026-11-01', endDate: null, sessions: [] }],
      thisWeekStudyAttendance: [{ date: '2026-11-12', time: '19:00-19:50', subject: 'Matematik', topic: 'Türev', status: 'pending' }],
      koleksiyonMedia: [{ type: 'movie', title: 'Inception', status: 'completed' }],
      subscriptions: [],
    };
    const boundedStr = mobileAi.serializeBoundedContext(hugeNotesPayload);
    assert.ok(boundedStr.length <= 28000);
    const boundedObj = JSON.parse(boundedStr);
    assert.equal(boundedObj.today, '2026-11-12');
    assert.equal(boundedObj.tasks.length, 2);
    assert.equal(boundedObj.koleksiyonMedia.length, 1);

    // Tighter cap trims completed tasks before open tasks and keeps valid JSON
    const tightPayload = {
      today: '2026-11-12',
      tasks: [
        { text: 'Açık görev ' + 'X'.repeat(120), completed: false },
        { text: 'Tamamlanan görev ' + 'Y'.repeat(120), completed: true },
      ],
      notes: [{ title: 'N1', content: 'Z'.repeat(300) }],
      studyPrograms: [],
      thisWeekStudyAttendance: [{ date: '2026-11-12', time: '19:00-19:50', subject: 'Matematik', topic: 'Türev', status: 'pending' }],
      koleksiyonMedia: [{ type: 'movie', title: 'M'.repeat(200), status: 'completed' }],
      subscriptions: [],
    };
    const tightStr = mobileAi.serializeBoundedContext(tightPayload, 420);
    assert.ok(tightStr.length <= 420);
    const tightObj = JSON.parse(tightStr);
    assert.equal(tightObj.tasks.some((t) => t.completed === false), true);
    assert.equal(tightObj.tasks.some((t) => t.completed === true), false);

    // Extreme single field guard never exceeds maxChars and always parses as JSON
    const extremeStr = mobileAi.serializeBoundedContext(
      {
        today: '2026-11-12',
        tasks: [],
        notes: [],
        studyPrograms: [{ name: 'Dev ' + 'P'.repeat(40000), startDate: '2026-11-01', endDate: null, sessions: [] }],
        thisWeekStudyAttendance: [],
        koleksiyonMedia: [],
        subscriptions: [],
      },
      28000,
    );
    assert.ok(extremeStr.length <= 28000);
    assert.equal(JSON.parse(extremeStr).today, '2026-11-12');
  } finally {
    for (const id of [...noteIds, ...taskIds]) {
      await db.prepare('DELETE FROM records WHERE id=?').bind(id).run();
    }
  }
});

test('runCloudMobileAiChat configures 8192 tokens, model-aware thinkingConfig, 120s/45s timeouts, and clean FAST_MODEL fallback', async () => {
  const headers = { 'X-ACKDeck-Schema': '5' };
  const fakeKey = 'test-gemini-cloud-secret-value-123456';
  await call('ai/key', { apiKey: fakeKey }, ownerSecret, 'POST', headers);

  const mobileAi = await module('src/mobileAi.ts');
  assert.equal(mobileAi.modelTimeoutMs('gemini-3.8-flash'), 120_000);
  assert.equal(mobileAi.modelTimeoutMs('gemini-3.5-flash-lite'), 45_000);

  const origFetch = globalThis.fetch;
  const origTimeout = AbortSignal.timeout;
  const captured = [];
  const timeoutValues = [];
  let failPowerfulWith500 = false;

  AbortSignal.timeout = (ms) => {
    timeoutValues.push(ms);
    return origTimeout.call(AbortSignal, ms);
  };

  globalThis.fetch = async (url, init = {}) => {
    const urlStr = typeof url === 'string' ? url : url.url;
    const body = JSON.parse(String(init.body));
    captured.push({ url: urlStr, body, hasSignal: Boolean(init.signal) });

    if (failPowerfulWith500 && urlStr.includes('gemini-3.8-flash')) {
      return new Response('internal error', { status: 500 });
    }
    const text = urlStr.includes('gemini-3.8-flash') ? 'Güçlü cevap' : 'Hızlı cevap';
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    // 1. Powerful model sends 8192 maxOutputTokens, thinkingLevel: medium, and 120s timeout
    const powResult = await mobileAi.runCloudMobileAiChat(env, 'Planımı özetle', [], 'powerful');
    assert.equal(powResult.reply, 'Güçlü cevap');
    assert.equal(powResult.modelUsed, 'gemini-3.8-flash');
    assert.equal(powResult.modelTier, 'powerful');
    assert.equal(captured.length, 1);
    assert.equal(captured[0].hasSignal, true);
    assert.equal(captured[0].body.generationConfig.maxOutputTokens, 8192);
    assert.deepEqual(captured[0].body.generationConfig.thinkingConfig, { thinkingLevel: 'medium' });
    assert.deepEqual(timeoutValues, [120_000]);

    // 2. HTTP 500 from POWERFUL_MODEL falls back to FAST_MODEL without thinkingConfig and 45s timeout
    captured.length = 0;
    timeoutValues.length = 0;
    failPowerfulWith500 = true;

    const fbResult = await mobileAi.runCloudMobileAiChat(env, 'Yedek test', [], 'powerful');
    assert.equal(fbResult.reply, 'Hızlı cevap');
    assert.equal(fbResult.modelUsed, 'gemini-3.5-flash-lite');
    assert.equal(fbResult.modelTier, 'fast');
    assert.equal(captured.length, 2);
    assert.ok(captured[0].url.includes('gemini-3.8-flash'));
    assert.equal(captured[0].body.generationConfig.maxOutputTokens, 8192);
    assert.deepEqual(captured[0].body.generationConfig.thinkingConfig, { thinkingLevel: 'medium' });
    assert.ok(captured[1].url.includes('gemini-3.5-flash-lite'));
    assert.equal(captured[1].body.generationConfig.maxOutputTokens, 8192);
    assert.equal('thinkingConfig' in captured[1].body.generationConfig, false);
    assert.deepEqual(timeoutValues, [120_000, 45_000]);
  } finally {
    globalThis.fetch = origFetch;
    AbortSignal.timeout = origTimeout;
    await call('ai/key', {}, ownerSecret, 'DELETE', headers);
  }
});

test('security hardening: owner-only /api/ai/key mutations with readable GET status and mutation rate limiting', async () => {
  const headers = { 'X-ACKDeck-Schema': '5' };
  await db.prepare('UPDATE devices SET revoked_at=NULL WHERE id=?').bind(deviceId).run();
  await call('ai/key', undefined, ownerSecret, 'DELETE', headers);
  await db.prepare('DELETE FROM rate_limits').run();

  try {
    // Unauthenticated GET fails
    assert.equal((await call('ai/key', undefined, null, 'GET', headers)).response.status, 401);

    // Paired phone cannot POST /api/ai/key (403 before reading/modifying)
    const fakeKey = 'test-gemini-cloud-secret-value-987654';
    const phonePost = await call('ai/key', { apiKey: fakeKey }, phone, 'POST', headers);
    assert.equal(phonePost.response.status, 403);

    // GET /api/ai/key remains readable by paired phone and reports false
    const getBefore = await call('ai/key', undefined, phone, 'GET', headers);
    assert.equal(getBefore.response.status, 200);
    assert.deepEqual(getBefore.data, { configured: false });

    // Owner succeeds saving key, phone GET reports configured: true without leaking key
    const ownerPost = await call('ai/key', { apiKey: fakeKey }, ownerSecret, 'POST', headers);
    assert.equal(ownerPost.response.status, 200);
    assert.equal(ownerPost.data.configured, true);

    const getAfter = await call('ai/key', undefined, phone, 'GET', headers);
    assert.equal(getAfter.response.status, 200);
    assert.deepEqual(getAfter.data, { configured: true });
    assert.ok(!JSON.stringify(getAfter.data).includes(fakeKey));

    // Paired phone cannot DELETE /api/ai/key (403, key stays configured)
    const phoneDel = await call('ai/key', undefined, phone, 'DELETE', headers);
    assert.equal(phoneDel.response.status, 403);
    assert.equal((await call('ai/key', undefined, phone, 'GET', headers)).data.configured, true);

    // Owner succeeds deleting key
    const ownerDel = await call('ai/key', undefined, ownerSecret, 'DELETE', headers);
    assert.equal(ownerDel.response.status, 200);
    assert.equal((await call('ai/key', undefined, phone, 'GET', headers)).data.configured, false);

    // Rate limit on /api/ai/key mutations (10/60s): 2 mutations above + 8 more = 10, 11th -> 429
    for (let i = 0; i < 8; i++) {
      const r = await call('ai/key', undefined, ownerSecret, 'DELETE', headers);
      assert.equal(r.response.status, 200);
    }
    const rateLimited = await call('ai/key', undefined, ownerSecret, 'DELETE', headers);
    assert.equal(rateLimited.response.status, 429);
  } finally {
    await db.prepare('DELETE FROM rate_limits').run();
    await call('ai/key', undefined, ownerSecret, 'DELETE', headers);
  }
});

test('security hardening: /api/dorm-menu?force=1 and /api/weather enforce IP-hash rate limits cleanly', async () => {
  const records = [{ id: 'dm-1', tarih: '2026-11-12', kahvalti: '', aksam: 'Çorba', yayinda: true }];
  await kv.put('dorm-menu:cache', JSON.stringify({ fetchedAt: Date.now(), records }));

  // 1. /api/dorm-menu?force=1 allows 4 per 300s, rejects 5th with 429 and CORS header without outbound fetch
  const forceIp = '203.0.113.10';
  for (let i = 0; i < 4; i++) {
    const res = await mf.dispatchFetch('https://ack.example/api/dorm-menu?force=1', {
      headers: { 'CF-Connecting-IP': forceIp },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  }
  const outboundBefore5th = outbound.length;
  const force5th = await mf.dispatchFetch('https://ack.example/api/dorm-menu?force=1', {
    headers: { 'CF-Connecting-IP': forceIp },
  });
  assert.equal(force5th.status, 429);
  assert.equal(force5th.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(force5th.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(outbound.length, outboundBefore5th);
  const force5thBody = await force5th.json();
  assert.equal(typeof force5thBody.error, 'string');
  assert.ok(force5thBody.error.length > 0);

  // Regular /api/dorm-menu (without force=1) from another IP allows 30/60s, 31st -> 429
  const regularIp = '203.0.113.11';
  for (let i = 0; i < 30; i++) {
    const res = await mf.dispatchFetch('https://ack.example/api/dorm-menu', {
      headers: { 'CF-Connecting-IP': regularIp },
    });
    assert.equal(res.status, 200);
  }
  const reg31st = await mf.dispatchFetch('https://ack.example/api/dorm-menu', {
    headers: { 'CF-Connecting-IP': regularIp },
  });
  assert.equal(reg31st.status, 429);
  assert.equal(reg31st.headers.get('Access-Control-Allow-Origin'), '*');

  // 2. /api/weather enforces IP-hash rate limit (60/60s)
  const weatherIp = '203.0.113.12';
  for (let i = 0; i < 60; i++) {
    const res = await mf.dispatchFetch('https://ack.example/api/weather?city=Karabük', {
      headers: { 'CF-Connecting-IP': weatherIp },
    });
    assert.equal(res.status, 200);
  }
  const weather61st = await mf.dispatchFetch('https://ack.example/api/weather?city=Karabük', {
    headers: { 'CF-Connecting-IP': weatherIp },
  });
  assert.equal(weather61st.status, 429);
  assert.equal(weather61st.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('security hardening: /api/image-proxy enforces MIME allowlist, manual redirects, 5 MB cap, nosniff, and rate limit', async () => {
  const origFetch = globalThis.fetch;
  const fetchedUrls = [];
  let mockFetchImpl = async () => new Response('unexpected', { status: 500 });

  globalThis.fetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : input.url;
    fetchedUrls.push({ url: urlStr, redirect: init?.redirect });
    return mockFetchImpl(urlStr, init);
  };

  const proxyCall = (targetUrl, ip = '203.0.113.20', method = 'GET') =>
    worker.default.fetch(
      new Request(`https://ack.example/api/image-proxy?url=${encodeURIComponent(targetUrl)}`, {
        method,
        headers: { 'CF-Connecting-IP': ip },
      }),
      env,
    );

  try {
    // 1. Non-HTTPS, userinfo, and disallowed host rejected (403) before any outbound fetch
    for (const badTarget of [
      'http://m.media-amazon.com/poster.jpg',
      'https://user:pass@m.media-amazon.com/poster.jpg',
      'https://evil.example/a.png',
    ]) {
      const res = await proxyCall(badTarget);
      assert.equal(res.status, 403, `Expected 403 for ${badTarget}`);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    }
    assert.equal(fetchedUrls.length, 0);

    // 2. Rejects text/html, image/svg+xml, and missing Content-Type with 415
    for (const badMime of ['text/html; charset=utf-8', 'image/svg+xml', null]) {
      mockFetchImpl = async () =>
        new Response('<svg></svg>', {
          status: 200,
          headers: badMime ? { 'Content-Type': badMime } : {},
        });
      const res = await proxyCall('https://upload.wikimedia.org/test.img');
      assert.equal(res.status, 415, `Expected 415 for Content-Type=${badMime}`);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
      assert.equal(fetchedUrls.at(-1).redirect, 'manual');
    }

    // 3. Rejects 302 redirect to disallowed host (403) and NEVER fetches evil.example
    fetchedUrls.length = 0;
    mockFetchImpl = async () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.example/a.png' },
      });
    const badRedir = await proxyCall('https://upload.wikimedia.org/redir-bad.jpg');
    assert.equal(badRedir.status, 403);
    assert.equal(badRedir.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(fetchedUrls.length, 1);
    assert.ok(!fetchedUrls.some((f) => f.url.includes('evil.example')));

    // Also rejects 302 redirect to http:// or userinfo URL on allowed host (403)
    for (const unsafeLoc of [
      'http://upload.wikimedia.org/downgrade.jpg',
      'https://user:pass@upload.wikimedia.org/creds.jpg',
    ]) {
      fetchedUrls.length = 0;
      mockFetchImpl = async () =>
        new Response(null, { status: 302, headers: { Location: unsafeLoc } });
      const res = await proxyCall('https://upload.wikimedia.org/redir-unsafe.jpg');
      assert.equal(res.status, 403);
      assert.equal(fetchedUrls.length, 1);
    }

    // 4. Rejects excessive redirect loop (> 2 hops) with 502
    fetchedUrls.length = 0;
    mockFetchImpl = async (urlStr) => {
      const n = Number(new URL(urlStr).searchParams.get('hop') || '0');
      return new Response(null, {
        status: 302,
        headers: { Location: `https://upload.wikimedia.org/loop.jpg?hop=${n + 1}` },
      });
    };
    const loopRes = await proxyCall('https://upload.wikimedia.org/loop.jpg?hop=0');
    assert.equal(loopRes.status, 502);
    assert.equal(fetchedUrls.length, 3); // initial + 2 allowed redirect hops, stops on 3rd 302

    // 5. Follows 302 redirect to allowed host returning valid image/jpeg with nosniff & CORS
    fetchedUrls.length = 0;
    mockFetchImpl = async (urlStr) => {
      if (urlStr.includes('/start.jpg')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://upload.wikimedia.org/final.jpg' },
        });
      }
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg; charset=binary' },
      });
    };
    const okRedir = await proxyCall('https://upload.wikimedia.org/start.jpg');
    assert.equal(okRedir.status, 200);
    assert.equal(okRedir.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(okRedir.headers.get('Content-Type'), 'image/jpeg');
    assert.equal(okRedir.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(okRedir.headers.get('Cache-Control'), 'public, max-age=604800');
    assert.deepEqual(new Uint8Array(await okRedir.arrayBuffer()), new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
    assert.equal(fetchedUrls.length, 2);

    // All 5 allowed raster MIMEs pass with nosniff
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']) {
      mockFetchImpl = async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': mime },
        });
      const r = await proxyCall(`https://image.tmdb.org/test?m=${encodeURIComponent(mime)}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('Content-Type'), mime);
      assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
    }

    // 6. Rejects > 5 MB via Content-Length header (413)
    mockFetchImpl = async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(6 * 1024 * 1024),
        },
      });
    const clOversize = await proxyCall('https://upload.wikimedia.org/huge-cl.jpg');
    assert.equal(clOversize.status, 413);
    assert.equal(clOversize.headers.get('Access-Control-Allow-Origin'), '*');

    // 7. Rejects > 5 MB via streaming chunks without Content-Length (413)
    let cancelled = false;
    let emitted = 0;
    mockFetchImpl = async () => {
      const chunk = new Uint8Array(1024 * 1024);
      const stream = new ReadableStream({
        pull(controller) {
          if (emitted >= 12) {
            controller.close();
            return;
          }
          emitted += 1;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    };
    const streamOversize = await proxyCall('https://upload.wikimedia.org/huge-stream.png');
    assert.equal(streamOversize.status, 413);
    assert.equal(cancelled, true);
    assert.ok(emitted < 12, `Expected early stream cancel before 12 chunks, emitted ${emitted}`);

    // 8. Rate limit (80/60s) on /api/image-proxy using distinct IP
    const rateIp = '203.0.113.21';
    mockFetchImpl = async () =>
      new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'Content-Type': 'image/webp' } });
    for (let i = 0; i < 80; i++) {
      const r = await proxyCall('https://upload.wikimedia.org/small.webp', rateIp);
      assert.equal(r.status, 200);
    }
    const fetchCountBefore81 = fetchedUrls.length;
    const rate81 = await proxyCall('https://upload.wikimedia.org/small.webp', rateIp);
    assert.equal(rate81.status, 429);
    assert.equal(rate81.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(fetchedUrls.length, fetchCountBefore81);
  } finally {
    globalThis.fetch = origFetch;
  }
});
