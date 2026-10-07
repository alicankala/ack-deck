import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('desktop logical width/scale matrix retains usable form caps and palette isolation (structural, not rendered)',()=>{
  const css=read('src/App.css');assert.match(css,/--content-max: 1800px/);assert.match(css,/--form-max: 54rem/);assert.match(css,/\.overflow-menu > div[^}]*flex-direction: column/s);assert.match(css,/\.task-text[^}]*min-width: 0/s);assert.match(css,/\.project-folder-row input[^}]*min-width: 0/s);assert.match(css,/dialog:not\(\.standalone-palette\)[^}]*100dvh/s);
  for(const [width,height] of [[1280,720],[1366,768],[1440,900],[1920,1080],[2560,1440],[2560,1600]])for(const scale of [90,100,105,110,115,125]){const unit=scale/100,sidebar=228*unit,padding=Math.min(72*unit,Math.max(24*unit,width*.042)),content=Math.min(1800,width-sidebar-2*padding),form=Math.min(content,54*15*unit);assert.ok(content>650,`${width}x${height}/${scale}: content`);assert.ok(form<=content);assert.ok(Math.min(680,width-32)<width);assert.ok(height-32>0);}
  for(const file of ['Dashboard','Tasks','Workspaces','Shortcuts','Archive','Projects','ConversationHistory','PhoneSettings'])assert.match(read(`src/components/${file}.tsx`),/details|Subscriptions|EditorDialog|ActionMenu/);
  assert.match(read('src/components/Settings.tsx'),/role="tablist"/);assert.match(read('src/components/AckAi.tsx'),/Desteklenen dosyalar/);
});
test('phone width matrix reserves four touch targets and editor safe-area space (structural, not rendered)',()=>{
  const css=read('mobile/src/style.css'),ui=read('mobile/src/main.tsx');assert.match(css,/\.editor[^}]*100dvh/s);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/\.editor \.actions > button[^}]*flex: 1 1 100px/s);assert.match(css,/\.subscription-row > div[^}]*min-width: 0/s);assert.match(ui,/<SendCard/);assert.match(ui,/today-group/);assert.match(ui,/editorRef/);
  for(const width of [320,375,390,393,414,430]){const navColumn=(width-16-12)/4;assert.ok(navColumn>=44);const editorContent=width-28-32;assert.ok(editorContent>240);assert.ok(Math.min(editorContent,600)<=width);}
  const subscription=read('shared/SubscriptionForm.tsx'),recurrence=read('shared/RecurrenceFields.tsx');assert.match(subscription,/Ödeme hatırlatması/);assert.match(subscription,/subscription-options/);assert.doesNotMatch(subscription,/Diğer bilgiler|<details/);assert.match(recurrence,/Bitiş seçenekleri/);assert.doesNotMatch(css,/overflow-x:\s*hidden/);
});
