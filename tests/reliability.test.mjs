import test from 'node:test';
import assert from 'node:assert/strict';
import {setupModules} from './helpers.mjs';
const desktop={closeToTray:false,startInTray:false,autoStart:false};
const previous={fast:'gemini-3.5-flash-lite',powerful:'gemini-3.8-flash'};
test('notification targets open existing task/payment identity and reject malformed input',()=>{
  const api=setupModules().load('nativeNavigation');
  assert.equal(api.nativeNavigation('task:original-id').page,'tasks');assert.equal(api.nativeNavigation('task:original-id').id,'original-id');
  assert.equal(api.nativeNavigation('subscription:payment-id').page,'subscriptions');assert.equal(api.nativeNavigation('subscription:payment-id').id,'payment-id');
  for(const value of ['task:','subscription:', 'task:'+ 'x'.repeat(513),'task:id\n','https://evil'])assert.equal(api.nativeNavigation(value),null);
});
test('custom model settings round-trip and older backups do not reset them',async()=>{
  const env=setupModules(),api=env.load('backupStore'),backup=api.createBackup(desktop,'1.3.0');
  backup.data.geminiModels={fast:'gemini-3.5-flash-lite',powerful:'gemini-custom-model'};
  assert.equal(api.parseBackup(JSON.stringify(backup)).data.geminiModels.powerful,'gemini-custom-model');
  for(const invalid of [{fast:'https://evil',powerful:'gemini-x'},{...previous,apiKey:'private'},{fast:'gemini-x/../../',powerful:'gemini-x'}])assert.throws(()=>api.parseBackup(JSON.stringify({...backup,data:{...backup.data,geminiModels:invalid}})));
  const calls=[],native=async(command,args)=>{calls.push({command,args});return command==='get_gemini_models'?previous:[];};
  await api.restoreBackup(backup,true,desktop,env.storage,native);assert.equal(calls.find(c=>c.command==='save_gemini_models').args.settings.powerful,'gemini-custom-model');
  calls.length=0;delete backup.data.geminiModels;await api.restoreBackup(backup,true,desktop,env.storage,native);assert.equal(calls.some(c=>c.command.includes('gemini')),false);
});
test('failed restore rolls native model settings back with the data and rejects unreadable baseline before changes',async()=>{
  let failed=false;const env=setupModules([],{failWrite:key=>key==='ack-deck.projects.v1'&&!failed&&(failed=true)}),api=env.load('backupStore'),backup=api.createBackup(desktop,'1.3.0');backup.data.geminiModels={...previous,powerful:'gemini-new-model'};
  const saved=[];const native=async(c,a)=>{if(c==='get_gemini_models')return previous;if(c==='save_gemini_models')saved.push(a.settings.powerful);return [];};
  await assert.rejects(api.restoreBackup(backup,true,desktop,env.storage,native),/Önceki veriler/);assert.deepEqual(saved,['gemini-new-model','gemini-3.8-flash']);assert.equal(env.values.has('ack-deck.restore-journal.v1'),false);
  let writes=0;await assert.rejects(api.restoreBackup(backup,true,desktop,env.storage,async c=>{if(c==='get_gemini_models')return {};writes++;}),/Model kurtarma/);assert.equal(writes,0);
});
