import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('desktop CSS retains form caps and palette isolation',()=>{
  const css=read('src/App.css');assert.match(css,/--content-max: 1800px/);assert.match(css,/--form-max: 54rem/);assert.match(css,/\.overflow-menu > div[^}]*flex-direction: column/s);assert.match(css,/\.task-text[^}]*min-width: 0/s);assert.match(css,/\.project-folder-row input[^}]*min-width: 0/s);assert.match(css,/dialog:not\(\.standalone-palette\)[^}]*100dvh/s);
  for(const file of ['Dashboard','Tasks','Workspaces','Shortcuts','Archive','Projects','ConversationHistory','PhoneSettings'])assert.match(read(`src/components/${file}.tsx`),/details|Subscriptions|EditorDialog|ActionMenu/);
  assert.match(read('src/components/Settings.tsx'),/role="tablist"/);assert.match(read('src/components/AckAi.tsx'),/Desteklenen dosyalar/);
});
test('phone editor retains safe-area and subscription controls',()=>{
  const css=read('mobile/src/style.css'),ui=read('mobile/src/main.tsx');assert.match(css,/\.editor[^}]*100dvh/s);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/\.editor \.actions > button[^}]*flex: 1 1 100px/s);assert.match(css,/\.subscription-row > div[^}]*min-width: 0/s);assert.match(ui,/<SendCard/);assert.match(ui,/today-group/);assert.match(ui,/editorRef/);
  const subscription=read('shared/SubscriptionForm.tsx'),recurrence=read('shared/RecurrenceFields.tsx');assert.match(subscription,/Ödeme hatırlatması/);assert.match(subscription,/subscription-options/);assert.doesNotMatch(subscription,/Diğer bilgiler|<details/);assert.match(recurrence,/Tekrarın süresi/);assert.doesNotMatch(recurrence,/<details/);assert.doesNotMatch(css,/overflow-x:\s*hidden/);
});
