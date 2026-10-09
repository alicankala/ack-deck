import test from 'node:test';
import assert from 'node:assert/strict';
import {setupModules} from './helpers.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
const program={id:'study-1',name:'Dönem programım',startDate:'2026-10-05',endDate:'2026-10-16',timezone:'Europe/Istanbul',active:true,updatedAt:1,sessions:[{id:'s1',subject:'Matematik',topic:'Türev',weekdays:[1,3,5],time:'19:00',minutes:50},{id:'s2',subject:'Fizik',topic:'Kuvvet',weekdays:[2,4],time:'20:00',minutes:60}]};
test('agenda combines a task and its alert without changing recurrence or losing cross-week alerts',()=>{
 const env=setupModules(),plan=env.load('../shared/weeklyPlan'),agenda=env.load('../shared/planAgenda'),rec=env.load('../shared/recurrence');
 const dueAt=rec.zonedAt('2026-10-09','14:00','Europe/Istanbul'),task={id:'t',text:'Kargoyu ara',completed:false,dueDate:'2026-10-09',dueTime:'14:00',dueAt,timezone:'Europe/Istanbul',reminder:true,reminderLeadMinutes:60};
 const raw=plan.weeklyPlan([task],[],new Date('2026-10-09T12:00:00')),shown=agenda.planAgenda(raw);
 assert.equal(raw.length,2);assert.equal(shown.length,1);assert.equal(shown[0].label,'Kargoyu ara');assert.equal(shown[0].reminderTime,'13:00');assert.equal(shown[0].time,'14:00');
 const outside={...task,dueDate:'2026-10-12',dueAt:rec.zonedAt('2026-10-12','14:00','Europe/Istanbul'),reminderLeadMinutes:1440};
 const edge=agenda.planAgenda(plan.weeklyPlan([outside],[],new Date('2026-10-09T12:00:00')));assert.equal(edge.length,1);assert.equal(edge[0].reminder,true);assert.equal(edge[0].date,'2026-10-11');
 const rule={frequency:'daily',interval:1,weekdays:[],dayOfMonth:5,start:'2026-10-05',time:'20:00',timezone:'Europe/Istanbul',endDate:null,count:8};
 const series=agenda.planAgenda(plan.weeklyPlan([{...task,recurrence:rule,reminderLeadMinutes:1440}],[],new Date('2026-10-09T12:00:00')));
 assert.equal(series.filter(e=>!e.reminder).length,7);assert.equal(series.filter(e=>e.reminder).length,1);assert.equal(series.find(e=>e.date==='2026-10-06'&&!e.reminder).reminderDate,'2026-10-05');
});
test('program schedules repeat by weekday, respect start/end and pause without generating task records',()=>{
 const env=setupModules(),api=env.load('../shared/studyPrograms');assert.equal(api.validStudyProgram(program),true);
 const week=api.studyBlocks([program],new Date('2026-10-09T12:00:00'));assert.equal(week.length,5);assert.equal(week.find(b=>b.label==='Matematik').endTime,'19:50');
 assert.equal(api.studyBlocks([{...program,active:false}],new Date('2026-10-09T12:00:00')).length,0);
 assert.equal(api.studyBlocks([program],new Date('2026-10-20T12:00:00')).length,0);
 assert.equal(api.studyBlocks([{...program,startDate:'2026-10-08'}],new Date('2026-10-09T12:00:00')).length,2);
 assert.equal(env.values.has('ack-deck.tasks.v1'),false);
 const conflict={...program,id:'other',sessions:[{...program.sessions[0],id:'other-s',time:'19:30'}]};assert.equal(api.studyConflicts([program,conflict],new Date('2026-10-09T12:00:00')).length,6);
});
test('program schema rejects malformed dates, duplicate IDs, secrets, invalid weekdays and overnight sessions',()=>{
 const api=setupModules().load('../shared/studyPrograms');
 for(const patch of [{startDate:'2026-02-30'},{endDate:'2026-10-01'},{timezone:'not-a-zone'},{name:'C:/private/file'},{sessions:[]},{sessions:[program.sessions[0],program.sessions[0]]}])assert.equal(api.validStudyProgram({...program,...patch}),false);
 for(const patch of [{weekdays:[0]},{weekdays:[1,1]},{minutes:0},{time:'25:00'},{time:'23:50',minutes:50},{subject:'Bearer abcdefghijklmnop'}])assert.equal(api.validStudyProgram({...program,sessions:[{...program.sessions[0],...patch}]}),false);
});
test('program storage preserves damaged records, blocks invalid root and retains quota-failed drafts',()=>{
 const env=setupModules(),api=env.load('studyProgramStore');assert.equal(api.saveStudyPrograms([program]),true);assert.deepEqual(plain(api.loadStudyPrograms().entries),[program]);
 const damaged={broken:true};env.values.set(api.STUDY_PROGRAM_KEY,JSON.stringify([program,damaged]));assert.equal(api.saveStudyPrograms([{...program,name:'Yeni'}]),true);assert.deepEqual(JSON.parse(env.values.get(api.STUDY_PROGRAM_KEY))[1],damaged);
 env.values.set(api.STUDY_PROGRAM_KEY,'broken');assert.equal(api.saveStudyPrograms([]),false);assert.equal(env.values.get(api.STUDY_PROGRAM_KEY),'broken');
 const quota=setupModules([], {failWrite:(key)=>key===api.STUDY_PROGRAM_KEY});assert.equal(quota.load('studyProgramStore').saveStudyPrograms([program]),false);
});
test('study programs use versioned mutation validation and opt-in full backup; old backups never clear them',async()=>{
 const env=setupModules([['ack-deck.study-programs.v1',JSON.stringify([program])]]),phone=env.load('../shared/phone'),api=env.load('backupStore');
 const mutation={mutationId:'m1',kind:'studyPrograms',id:program.id,baseVersion:0,data:program,deleted:false};assert.equal(phone.validMutation(mutation),true);assert.equal(phone.validCloudRecord({kind:mutation.kind,id:program.id,version:1,data:program,deleted:false,updatedAt:1}),true);assert.equal(phone.validMutation({...mutation,data:{...program,privateKey:'no'}}),false);
 const desktop={closeToTray:false,startInTray:false,autoStart:false},backup=api.createBackup(desktop,'1.3.0');assert.deepEqual(plain(backup.data.studyPrograms),[program]);
 delete backup.data.studyPrograms;await api.restoreBackup(backup,true,desktop,env.storage,async()=>{});assert.deepEqual(JSON.parse(env.values.get('ack-deck.study-programs.v1')),[program]);
 const complete=api.createBackup(desktop,'1.3.0');env.values.set('ack-deck.study-programs.v1','[]');await api.restoreBackup(complete,true,desktop,env.storage,async()=>{});assert.deepEqual(JSON.parse(env.values.get('ack-deck.study-programs.v1')),[program]);
});
