import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
test('shared task/subscription forms and mobile renderer bundle one React runtime',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const result=await build({root,logLevel:'silent',build:{write:false}});
  const modules=result.output.filter(item=>item.type==='chunk').flatMap(item=>Object.keys(item.modules).map(path=>path.replaceAll('\\','/')));
  for(const name of ['react','react-dom']){const paths=modules.filter(path=>path.includes(`/node_modules/${name}/`));assert.ok(paths.length>0);const roots=new Set(paths.map(path=>path.split(`/node_modules/${name}/`)[0]));assert.equal(roots.size,1,`${name}: multiple installations in client bundle`);}
  assert.ok(modules.some(path=>path.endsWith('/shared/SubscriptionForm.tsx')));assert.ok(modules.some(path=>path.endsWith('/shared/RecurrenceFields.tsx')));
});
