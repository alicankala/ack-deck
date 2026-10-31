import test from 'node:test';
import assert from 'node:assert/strict';
import { setupModules } from './helpers.mjs';
import * as adhanModule from 'adhan';

const plain = v => JSON.parse(JSON.stringify(v));
const sampleProgram = {
  id: 'study-1',
  name: 'Vize Çalışma Programı',
  startDate: '2026-10-05',
  endDate: '2026-11-07',
  timezone: 'Europe/Istanbul',
  active: true,
  updatedAt: 1,
  sessions: [
    { id: 's1', subject: 'Devre 1', topic: 'Düğüm gerilimleri', weekdays: [1, 3, 5], time: '19:00', minutes: 60 },
    { id: 's2', subject: 'Elektronik 2', topic: 'Frekans cevabı', weekdays: [2, 4], time: '20:00', minutes: 50 },
    { id: 's3', subject: 'EMD', topic: 'Maxwell denklemleri', weekdays: [6, 7], time: '14:00', minutes: 90 },
  ],
};

test('study programs validate, generate weekly blocks, detect conflicts, and parse AI markdown schedules', () => {
  const env = setupModules();
  const study = env.load('../shared/studyPrograms');
  const store = env.load('studyProgramStore');

  assert.equal(study.validStudyProgram(sampleProgram), true);
  assert.equal(study.validStudyProgram({ ...sampleProgram, name: 'C:/secret/path' }), false);
  assert.equal(study.validStudyProgram({ ...sampleProgram, sessions: [{ ...sampleProgram.sessions[0], time: '23:30', minutes: 60 }] }), false);

  const blocks = study.studyBlocks([sampleProgram], new Date('2026-10-09T12:00:00'));
  assert.equal(blocks.length, 7);
  assert.equal(blocks.find(b => b.label === 'Devre 1').endTime, '20:00');
  assert.equal(study.studyBlocks([{ ...sampleProgram, active: false }], new Date('2026-10-09T12:00:00')).length, 0);

  const overlapping = { ...sampleProgram, id: 'study-2', sessions: [{ ...sampleProgram.sessions[0], id: 's9', time: '19:30' }] };
  assert.equal(study.studyConflicts([sampleProgram, overlapping], new Date('2026-10-09T12:00:00')).length, 6);

  assert.equal(store.saveStudyPrograms([sampleProgram]), true);
  assert.deepEqual(plain(store.loadStudyPrograms().entries), [sampleProgram]);

  const draft = study.extractStudyProgramDraft(
    '## 7 Kasım Vize Çizelgesi\n- Pazartesi, Çarşamba 19:00 - 20:00 | Devre 1 | Tevenin ve Norton\n- Salı, Perşembe 20:00 (50 dk) | Elektronik 2 | BJT yükselteçler\n- Cumartesi 14:00 - 15:30 | EMD | Sınır koşulları',
    new Date('2026-10-20T12:00:00'),
  );
  assert.equal(draft.name, '7 Kasım Vize Çizelgesi');
  assert.equal(draft.endDate, '2026-11-07');
  assert.equal(draft.sessions.length, 3);
  assert.deepEqual(plain(draft.sessions[0].weekdays), [1, 3]);
  assert.equal(draft.sessions[0].subject, 'Devre 1');
  assert.equal(draft.sessions[0].minutes, 60);
  assert.equal(study.validStudyProgram(draft), true);
});

test('ACK AI creates, updates, and deletes study programs on Weekly Plan with confirmation and context', async () => {
  const env = setupModules();
  const actions = env.load('ackActions');
  const integration = env.load('ackIntegration');
  const store = env.load('studyProgramStore');

  const proposal = actions.proposalFromTool(
    {
      name: 'create_study_program',
      args: {
        name: 'Güz Vize Planı',
        sessions: [
          { subject: 'Devre 1', topic: 'Çevre akımları', weekdays: [1, 3, 5], time: '19:00', minutes: 60 },
          { subject: 'Elektronik 2', topic: 'Op-Amp', weekdays: [2, 4], time: '20:30', minutes: 50 },
        ],
      },
    },
    '7 Kasıma kadar Devre 1 ve Elektronik 2 ders programı oluştur ve haftalık plana ekle',
    new Date('2026-10-20T12:00:00'),
  );

  assert.equal(proposal.action.type, 'create_study_program');
  assert.equal(proposal.action.endDate, '2026-11-07');
  assert.match(proposal.question, /Haftalık Plan'a eklensin mi/);
  assert.match(proposal.question, /Devre 1/);

  let navigated = null;
  await assert.rejects(() => actions.executeAckAction(proposal.action, false), /onay/i);
  const result = await actions.executeAckAction(proposal.action, true, async () => {}, target => { navigated = target; }, proposal.expected);
  assert.match(result, /Haftalık Plan'a eklendi/);
  assert.deepEqual(plain(navigated), { page: 'calendar' });

  const saved = store.loadStudyPrograms().entries;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Güz Vize Planı');

  assert.equal(integration.planAckSources('haftalık ders programı çizelgesi').includes('studyprograms'), true);
  const ctx = await integration.collectAckContext('ders programım nedir');
  assert.equal(ctx.context.some(c => c.source === 'studyprograms' && c.data.includes('Güz Vize Planı')), true);
  assert.equal(integration.contextReferences(ctx.context)[0].source, 'calendar');

  const updateProp = actions.proposalFromTool(
    { name: 'update_study_program', args: { programId: saved[0].id, active: false } },
    'programı duraklat',
  );
  await actions.executeAckAction(updateProp.action, true, async () => {}, undefined, updateProp.expected);
  assert.equal(store.loadStudyPrograms().entries[0].active, false);
});

test('tasks, notes, backups, and privacy boundaries keep local data safe and credential-free', async () => {
  const env = setupModules();
  const tasks = env.load('taskStore');
  const notes = env.load('notesStore');
  const backup = env.load('backupStore');
  const privacy = env.load('privacy');

  assert.equal(tasks.saveTasks([{ id: 't1', text: 'Raporu tamamla', completed: false, priority: 'important', reminder: false }], tasks.loadTasks()), true);
  assert.equal(notes.saveNotes([{ id: 'n1', title: 'Ders Notu', content: 'EMD özet', updatedAt: 10 }]), true);
  assert.equal(env.load('studyProgramStore').saveStudyPrograms([sampleProgram]), true);

  const secret = 'AIza' + 'X'.repeat(35);
  assert.equal(privacy.redactSecrets(`Key: ${secret}`).includes(secret), false);
  const testUrl = 'https://m.media-amazon.com/images/M/MV5BMTcxNDI0NzUxMF5BMl5BanBnXkFtZTcwOTIzMjkyNw@@._V1_QL75_UX400.jpg';
  assert.equal(privacy.scrubPrivateText(testUrl), testUrl);
  assert.equal(privacy.scrubPrivateText('C:\\Users\\Alican\\test.txt'), '[yerel konum]');
  assert.equal(privacy.scrubPrivateText('D:/Projects/ack-deck'), '[yerel konum]');
  const mediaModule = env.load('../shared/media');
  assert.equal(mediaModule.validMediaItem({ id: 'm1', type: 'movie', title: 'Safe', status: 'completed', posterUrl: testUrl, createdAt: 100, updatedAt: 100 }), true);

  // Test recurring completion, uncompletion and sorting in completed filter
  const rec = env.load('../shared/recurrence');
  const rule = { frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], dayOfMonth: 1, start: '2026-10-19', time: '12:00', timezone: 'Europe/Istanbul' };
  const recurringTask = { id: 'rec-1', text: 'Hafta içi görev', completed: false, dueDate: '2026-10-22', dueTime: '12:00', recurrence: rule };
  const completedRec = rec.completeOccurrence(recurringTask, new Date('2026-10-22T12:00:00Z').getTime());
  assert.equal(rec.isOccurrenceCompleted(completedRec), true);
  const uncompletedRec = rec.uncompleteOccurrence(completedRec);
  assert.equal(uncompletedRec.dueDate, '2026-10-22');
  assert.equal(rec.isOccurrenceCompleted(uncompletedRec), false);

  // Sorting: undated task completed at 12:30 slots between dated 12:00 and dated 13:00
  const taskDated12 = { dueDate: '2026-10-22', dueTime: '12:00' };
  const taskUndated1230 = { dueDate: null, dueTime: null, lastCompletedAt: new Date('2026-10-22T12:30:00').getTime() };
  const taskDated13 = { dueDate: '2026-10-22', dueTime: '13:00' };
  const sorted = [taskDated12, taskDated13, taskUndated1230].sort((a, b) => rec.completedTaskSortTime(b) - rec.completedTaskSortTime(a));
  assert.deepEqual(sorted, [taskDated13, taskUndated1230, taskDated12]);

  const desktop = { closeToTray: false, startInTray: false, autoStart: false };
  const snapshot = backup.createBackup(desktop, '1.4.1');
  assert.equal(snapshot.data.tasks.length, 1);
  assert.equal(snapshot.data.studyPrograms.length, 1);

  env.values.set(tasks.TASKS_STORAGE_KEY, '[]');
  await backup.restoreBackup(snapshot, true, desktop, env.storage, async () => {});
  assert.equal(tasks.loadTasks().entries.length, 1);
  assert.equal(env.load('studyProgramStore').loadStudyPrograms().entries.length, 1);
});

test('prayer times calculate daily schedule, kerahat status, and pending notifications', async () => {
  const env = setupModules([], { adhan: adhanModule });
  const prayer = env.load('../shared/prayerTimes');
  const prayerStore = env.load('prayerStore');

  // Ankara coordinates: 39.91987, 32.85427
  const date = new Date('2026-10-20T12:00:00+03:00');
  const info = prayer.calculatePrayerTimes(39.91987, 32.85427, date, 'Ankara');

  assert.equal(info.city, 'Ankara');
  assert.equal(info.items.length, 6);
  assert.deepEqual(Array.from(info.items.map(i => i.name)), ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);
  assert.ok(info.items.every(i => /^\d{2}:\d{2}$/.test(i.time)));

  // Test kerahat status detection around Dhuhr (ishtiwa)
  const dhuhrTime = info.items.find(i => i.name === 'dhuhr').timestamp;
  const ishtiwaTime = new Date(dhuhrTime - 15 * 60 * 1000); // 15 mins before dhuhr
  const kerahatInfo = prayer.calculatePrayerTimes(39.91987, 32.85427, ishtiwaTime, 'Ankara');
  assert.equal(kerahatInfo.kerahat.inKerahat, true);
  assert.equal(kerahatInfo.kerahat.kind, 'ishtiwa');

  // Test pending reminders generator
  const config = {
    city: 'Ankara',
    latitude: 39.91987,
    longitude: 32.85427,
    notifyAtTime: true,
    notifyBeforeMinutes: 15,
  };
  const morning = new Date('2026-10-20T04:00:00+03:00');
  const reminders = prayerStore.pendingPrayerReminders(config, morning);
  assert.ok(reminders.length >= 6);
  assert.ok(reminders.some(r => r.id.startsWith('prayer:fajr:')));
  assert.ok(reminders.some(r => r.id.startsWith('prayer-lead:15:fajr:')));
  assert.ok(reminders.every(r => r.dueAt > morning.getTime()));

  // Test prayer guide catalog data (kamet, ayetel kursi, rakats, and surahs)
  const guide = env.load('../shared/prayerGuideData');
  assert.equal(guide.PRAYER_GUIDE_ITEMS.length, 5);
  const fajr = guide.PRAYER_GUIDE_ITEMS.find(p => p.id === 'fajr');
  assert.equal(fajr.totalRakats, 4);
  assert.equal(fajr.sections[1].hasKametBefore, true);

  assert.ok(guide.KAMET_INFO.turkishReading.includes('Kad kâmeti\'s-Salâh'));
  const ayatelKursi = guide.TESBIHAT_INFO.steps.find(s => s.isAyatelKursi);
  assert.ok(ayatelKursi);
  assert.ok(ayatelKursi.turkishReading.includes('Allâhü lâ ilâhe illâ hüve\'l-hayyü\'l-kayyûm'));

  assert.ok(guide.ZAMMI_SURELER.length >= 10);
  assert.ok(guide.ZAMMI_SURELER.some(s => s.id === 'fil'));
  assert.ok(guide.ZAMMI_SURELER.some(s => s.id === 'kevser'));
  assert.ok(guide.ZAMMI_SURELER.some(s => s.id === 'ihlas'));

  assert.ok(guide.NAMAZ_DUALARI.some(d => d.id === 'subhaneke'));
  assert.ok(guide.NAMAZ_DUALARI.some(d => d.id === 'kunut_1'));
});

test('unlimited storage proxy bypasses 5MB localStorage quota, 3-way note merge resolves non-overlapping lines, and ACK AI reads Koleksiyon & study attendance', async () => {
  const env = setupModules();
  const { createUnlimitedStorageProxy } = env.load('unlimitedStorage');
  const { mergeText3Way, tryMergeNoteRecords } = env.load('../shared/textMerge');
  const mediaStore = env.load('mediaStore');
  const studyStore = env.load('studyProgramStore');
  const studyLib = env.load('../shared/studyPrograms');
  const attendanceLib = env.load('../shared/studyAttendance');
  const integration = env.load('ackIntegration');
  const actions = env.load('ackActions');

  // 1. Unlimited storage proxy handles >6MB writes even when raw localStorage throws QuotaExceededError
  const persisted = new Map();
  const quotaStorage = {
    get length() { return 0; },
    key: () => null,
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
    clear: () => {},
  };
  const storage = createUnlimitedStorageProxy(
    quotaStorage,
    { 'ack-deck.seed': 'ok' },
    (k, v) => { if (v === null) persisted.delete(k); else persisted.set(k, v); },
  );
  const sixMb = 'x'.repeat(6 * 1024 * 1024);
  storage.setItem('ack-deck.notes.v1', sixMb);
  assert.equal(storage.getItem('ack-deck.notes.v1').length, 6 * 1024 * 1024);
  assert.equal(persisted.get('ack-deck.notes.v1').length, 6 * 1024 * 1024);
  storage.removeItem('ack-deck.notes.v1');
  assert.equal(storage.getItem('ack-deck.notes.v1'), null);

  // 2. 3-way line merge merges independent offline edits and flags same-line conflicts
  const cleanMerge = mergeText3Way('Başlık\nOrta satır\nAlt satır', 'Başlık (PC)\nOrta satır\nAlt satır', 'Başlık\nOrta satır\nAlt satır (Mobil)');
  assert.equal(cleanMerge.conflict, false);
  assert.equal(cleanMerge.merged, 'Başlık (PC)\nOrta satır\nAlt satır (Mobil)');

  const clashMerge = mergeText3Way('Tek satır', 'PC değişikliği', 'Mobil değişikliği');
  assert.equal(clashMerge.conflict, true);

  const mergedNote = tryMergeNoteRecords(
    { title: 'Not', content: 'A\nB\nC', updatedAt: 1 },
    { title: 'Not', content: 'A-yerel\nB\nC', updatedAt: 2 },
    { title: 'Not', content: 'A\nB\nC-bulut', updatedAt: 3 },
  );
  assert.ok(mergedNote);
  assert.equal(mergedNote.content, 'A-yerel\nB\nC-bulut');

  // 3. ACK AI sees Koleksiyon (mediaItems) + studyAttendance and proposes create_media_item
  const activeProgram = { ...sampleProgram, startDate: '2020-01-01', endDate: null };
  assert.equal(studyStore.saveStudyPrograms([activeProgram]), true);
  const blocks = studyLib.studyBlocks([activeProgram], new Date());
  assert.ok(blocks.length > 0);
  attendanceLib.setStudyBlockStatus(blocks[0].id, 'skipped');

  assert.equal(mediaStore.saveMedia([{
    id: 'm1',
    type: 'movie',
    title: 'Inception',
    status: 'completed',
    rating: 9,
    year: '2010',
    creator: 'Christopher Nolan',
    posterUrl: 'https://example.com/poster.jpg',
    createdAt: 1,
    updatedAt: 1,
  }]), true);

  const mediaCtx = await integration.collectAckContext('İzlediğim filmlere göre öneri yap');
  assert.equal(mediaCtx.context.some(c => c.source === 'media' && c.data.includes('Inception')), true);
  assert.equal(integration.contextReferences(mediaCtx.context)[0].source, 'media');

  const studyCtx = await integration.collectAckContext('Hangi derslere çalışmadım?');
  assert.equal(studyCtx.context.some(c => c.source === 'studyprograms' && c.data.includes('skipped')), true);

  const mediaProp = actions.proposalFromTool(
    { name: 'create_media_item', args: { mediaType: 'movie', title: 'Dune: Part Two', mediaStatus: 'planned', year: '2024' } },
    'Dune Part Two filmini koleksiyonuma ekle',
  );
  assert.equal(mediaProp.action.type, 'create_media_item');
  let targetPage = null;
  await actions.executeAckAction(mediaProp.action, true, async () => {}, t => { targetPage = t; });
  assert.deepEqual(plain(targetPage), { page: 'media' });
  assert.equal(mediaStore.loadMedia().entries.some(m => m.title === 'Dune: Part Two'), true);
});


