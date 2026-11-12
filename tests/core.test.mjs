import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { posix } from 'node:path';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';
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



test('Bugün card only peeks at upcoming tasks due within 2 days; far exams stay out', () => {
  const env = setupModules();
  const { todayTasks } = env.load('dashboardData');
  const now = new Date('2026-10-31T17:00:00');
  const task = (id, dueDate, dueTime = '13:00') => ({ id, text: id, completed: false, dueDate, dueTime, priority: 'normal', reminder: false });

  // Exam 10 days later must NOT appear in today's list.
  assert.deepEqual(plain(todayTasks([task('vize', '2026-11-10')], now)), []);

  // Tomorrow's task is shown with a clear "Yarın" label.
  const tomorrow = todayTasks([task('vize', '2026-11-10'), task('yarin', '2026-11-01')], now);
  assert.equal(tomorrow.length, 1);
  assert.equal(tomorrow[0].task.id, 'yarin');
  assert.equal(tomorrow[0].label, 'Yarın');

  // Day after tomorrow is still within the lookahead.
  const dayAfter = todayTasks([task('ertesi', '2026-11-02')], now);
  assert.equal(dayAfter[0].label, 'Sıradaki · 02.11.2026');

  // Today's and overdue tasks keep their behavior.
  const daily = todayTasks([task('bugun', '2026-10-31', '20:00'), task('gecmis', '2026-10-30')], now);
  assert.deepEqual(plain(daily.map(row => row.label)), ['Zamanı geçti', 'Bugün']);
});

test('dorm menu client cache enforces freshness: skips fetch when today menu present or recently checked', async () => {
  const env = setupModules();
  const dorm = env.load('../shared/dormMenu');

  // 1. Empty cache, no fetch time -> not fresh
  env.values.clear();
  assert.equal(dorm.isDormMenuFresh('2026-11-04'), false);

  // 2. Pre-seed cache with today's menu
  const todayRecords = [
    { id: '1', tarih: '2026-11-04', kahvalti: '', aksam: 'Tarhana\nKuru Fasülye\nPilav', yayinda: true }
  ];
  dorm.saveDormMenuCache(todayRecords);

  // Today's menu is now present -> fresh!
  assert.equal(dorm.isDormMenuFresh('2026-11-04'), true);

  // Calling fetchDormMenu(false) returns cached records immediately without network fetch
  const result = await dorm.fetchDormMenu(false);
  assert.equal(result.length, 1);
  assert.equal(result[0].aksam, 'Tarhana\nKuru Fasülye\nPilav');

  // 3. For a future date not in cache, but fetched recently (< 2.5 hours) -> fresh (suppresses hammering)
  assert.equal(dorm.isDormMenuFresh('2026-11-05'), true);

  // 4. If last fetch was 3 hours ago and target date is not in cache -> not fresh
  env.storage.setItem(dorm.DORM_MENU_LAST_FETCH_KEY, String(Date.now() - 3 * 3600 * 1000));
  assert.equal(dorm.isDormMenuFresh('2026-11-05'), false);
});

test('media items validate IMDb ratings, IDs and timestamps safely', () => {
  const env = setupModules();
  const media = env.load('../shared/media');

  const validMovie = {
    id: 'm-1',
    type: 'movie',
    title: 'Interstellar',
    status: 'completed',
    rating: 9,
    year: '2014',
    creator: 'Christopher Nolan',
    posterUrl: 'https://example.com/poster.jpg',
    imdbId: 'tt0816692',
    imdbRating: 8.7,
    imdbUpdatedAt: Date.now(),
    createdAt: 1000,
    updatedAt: 1000,
  };

  assert.equal(media.validMediaItem(validMovie), true);

  // Invalid imdbId format
  assert.equal(media.validMediaItem({ ...validMovie, imdbId: 'invalid-id' }), false);
  assert.equal(media.validMediaItem({ ...validMovie, imdbId: 'tt123' }), false); // too short

  // Invalid imdbRating bounds
  assert.equal(media.validMediaItem({ ...validMovie, imdbRating: 11 }), false);
  assert.equal(media.validMediaItem({ ...validMovie, imdbRating: -1 }), false);

  // Disallowed arbitrary properties rejected
  assert.equal(media.validMediaItem({ ...validMovie, maliciousField: 'hack' }), false);
});

test('Dashboard Görevler card lists all tasks across mobile-style filters without top-right + Görev shortcut', () => {
  const env = setupModules();
  const taskStore = env.load('taskStore');
  const actions = env.load('taskActions');
  const today = '2026-11-11';
  const make = (id, text, dueDate, dueTime = null, completed = false) => ({
    id,
    text,
    completed,
    dueDate,
    dueTime,
    priority: 'normal',
    reminder: false,
    ...(completed ? { lastCompletedAt: 1000 } : {}),
  });

  // 7 active tasks across overdue, today, future (>2 days), undated + 1 completed
  const seed = [
    make('t1', 'Geciken iş', '2026-11-10', '09:00'),
    make('t2', 'Bugün saat 20', '2026-11-11', '20:00'),
    make('t3', 'Vize Elektronik II', '2026-11-13', '11:00'),
    make('t4', 'Uzak sınav', '2026-11-25', '10:00'),
    make('t5', 'Tarihsiz A', null),
    make('t6', 'Tarihsiz B', null),
    make('t7', 'Tarihsiz C', null),
    make('t8', 'Biten iş', '2026-11-09', '12:00', true),
  ];
  assert.equal(taskStore.saveTasks(seed, taskStore.loadTasks()), true);

  assert.deepEqual(plain(actions.TASK_FILTERS.map(([, l]) => l)), ['Aktif', 'Bugün', 'Yaklaşan', 'Tarihsiz', 'Tamamlanan']);

  // 'all' (Aktif) returns ALL 7 active tasks without 5-item cap or 2-day lookahead cap
  assert.deepEqual(
    plain(actions.filterAndSortTasks(seed, 'all', today).map(t => t.id)),
    ['t1', 't2', 't3', 't4', 't5', 't6', 't7']
  );
  assert.deepEqual(plain(actions.filterAndSortTasks(seed, 'today', today).map(t => t.id)), ['t1', 't2']);
  assert.deepEqual(plain(actions.filterAndSortTasks(seed, 'upcoming', today).map(t => t.id)), ['t3', 't4']);
  assert.deepEqual(plain(actions.filterAndSortTasks(seed, 'undated', today).map(t => t.id)), ['t5', 't6', 't7']);
  assert.deepEqual(plain(actions.filterAndSortTasks(seed, 'completed', today).map(t => t.id)), ['t8']);

  // Complete & reopen round-trip
  const doneRes = actions.toggleTaskRecordCompletion('t2');
  assert.equal(doneRes.ok, true);
  assert.equal(doneRes.next.find(t => t.id === 't2').completed, true);
  const reopenRes = actions.toggleTaskRecordCompletion('t2');
  assert.equal(reopenRes.ok, true);
  assert.equal(reopenRes.next.find(t => t.id === 't2').completed, false);

  // Edit via saveTaskDraft
  const originalT3 = taskStore.loadTasks().entries.find(t => t.id === 't3');
  const saveRes = actions.saveTaskDraft({ ...originalT3, text: 'Vize Elektronik II (Güncel)' }, originalT3);
  assert.equal(saveRes.ok, true);
  assert.equal(taskStore.loadTasks().entries.find(t => t.id === 't3').text, 'Vize Elektronik II (Güncel)');

  // Snooze & Delete with undo
  const snoozeRes = actions.snoozeTaskRecord(originalT3, 15);
  assert.equal(snoozeRes.ok, true);
  assert.equal(Boolean(taskStore.loadTasks().entries.find(t => t.id === 't3').snoozedUntil), true);

  const delRes = actions.deleteTaskRecord(taskStore.loadTasks().entries.find(t => t.id === 't5'));
  assert.equal(delRes.ok, true);
  assert.equal(taskStore.loadTasks().entries.some(t => t.id === 't5'), false);

  // Verify Dashboard uses DashboardTasksCard and does not have + Görev shortcut
  const dashboardSrc = readFileSync(new URL('../src/components/Dashboard.tsx', import.meta.url), 'utf8');
  const cardSrc = readFileSync(new URL('../src/components/DashboardTasksCard.tsx', import.meta.url), 'utf8');
  assert.equal(dashboardSrc.includes('<DashboardTasksCard'), true);
  assert.equal(dashboardSrc.includes('+ Görev'), false);
  assert.equal(cardSrc.includes('+ Görev'), false);
  assert.equal(cardSrc.includes('Görevler'), true);
});

test('updater streams live download progress events, tracks check time, and preserves retry state', async () => {
  const listeners = new Map();
  let unlistenCount = 0;
  let nextCheckResult = null;
  const phases = [];

  const env = setupModules([], {
    tauri: true,
    listen: async (eventName, cb) => {
      listeners.set(eventName, cb);
      return () => {
        unlistenCount += 1;
        listeners.delete(eventName);
      };
    },
    invoke: async (command) => {
      if (command === 'check_update') {
        if (nextCheckResult instanceof Error) throw nextCheckResult;
        if (nextCheckResult === '2.0.5') {
          const emit = listeners.get('ack-update-progress');
          emit?.({ payload: { version: '2.0.5', phase: 'started', downloadedBytes: 0, totalBytes: null, percent: null } });
          emit?.({ payload: { version: '2.0.5', phase: 'downloading', downloadedBytes: 3145728, totalBytes: 6291456, percent: 50 } });
          // Ignore regressive stale progress
          emit?.({ payload: { version: '2.0.5', phase: 'downloading', downloadedBytes: 1000, totalBytes: 6291456, percent: 15 } });
          emit?.({ payload: { version: '2.0.5', phase: 'verifying', downloadedBytes: 6291456, totalBytes: 6291456, percent: 100 } });
        }
        return nextCheckResult;
      }
      if (command === 'install_update') {
        throw new Error('simulated install failure');
      }
      return null;
    },
  });

  const client = env.load('updateClient');
  const unsubscribe = client.subscribeUpdates(() => {
    phases.push(structuredClone(client.updateSnapshot()));
  });

  assert.equal(client.formatUpdateVersion('2.0.4'), 'v2.0.4');
  assert.equal(client.formatUpdateVersion('v2.0.4'), 'v2.0.4');
  assert.equal(client.formatUpdateVersion(''), '—');
  assert.equal(client.formatUpdateBytes(512), '512 B');
  assert.equal(client.formatUpdateBytes(2048), '2 KB');
  assert.match(client.formatUpdateBytes(4089446), /^3[.,]9 MB$/);
  const now = new Date(2026, 10, 11, 22, 10).getTime();
  assert.match(client.formatUpdateCheckTime(new Date(2026, 10, 11, 21, 30).getTime(), now), /^Bugün 21:30$/);
  assert.match(client.formatUpdateCheckTime(new Date(2026, 10, 10, 18, 15).getTime(), now), /^Dün 18:15$/);

  // 1. Up-to-date check
  nextCheckResult = null;
  await client.checkUpdates();
  assert.equal(client.updateSnapshot().phase, 'idle');
  assert.equal(client.updateSnapshot().upToDate, true);
  assert.equal(typeof client.updateSnapshot().checkedAt, 'number');
  assert.equal(env.values.has('ack-deck.update-last-checked.v1'), true);
  assert.equal(unlistenCount, 1);

  // 2. Error check retains failure cleanly
  nextCheckResult = new Error('network');
  await client.checkUpdates();
  assert.equal(client.updateSnapshot().phase, 'error');
  assert.equal(unlistenCount, 2);

  // 3. Full download -> verifying -> ready flow (with monotonic progress)
  phases.length = 0;
  nextCheckResult = '2.0.5';
  await client.checkUpdates();
  assert.equal(unlistenCount, 3);
  assert.equal(client.updateSnapshot().phase, 'ready');
  assert.equal(client.updateSnapshot().version, '2.0.5');

  const downloadPhases = phases.filter(s => s.phase === 'downloading');
  assert.equal(downloadPhases.length >= 2, true);
  assert.equal(downloadPhases[downloadPhases.length - 1].progress.percent, 50);
  assert.equal(downloadPhases[downloadPhases.length - 1].progress.downloadedBytes, 3145728);
  assert.equal(phases.some(s => s.phase === 'verifying' && s.progress?.percent === 100), true);

  unsubscribe();

  // Verify UpdateSettings & UpdateNotice markup contract
  const settingsSrc = readFileSync(new URL('../src/components/UpdateSettings.tsx', import.meta.url), 'utf8');
  const noticeSrc = readFileSync(new URL('../src/components/UpdateNotice.tsx', import.meta.url), 'utf8');
  assert.equal(settingsSrc.includes('update-status-pill'), true);
  assert.equal(settingsSrc.includes('update-status-strip'), true);
  assert.equal(settingsSrc.includes('role="progressbar"'), true);
  assert.equal(settingsSrc.includes('Kur ve Yeniden Başlat'), true);
  assert.equal(noticeSrc.includes('downloading'), true);
  assert.equal(noticeSrc.includes('verifying'), true);
});

test('prayer widgets omit the expandable 0/5 stats toggle and dropdown panel on desktop and mobile', () => {
  const desktopPrayerSrc = readFileSync(new URL('../src/components/PrayerWidget.tsx', import.meta.url), 'utf8');
  const mobilePrayerSrc = readFileSync(new URL('../mobile/src/MobilePrayerCard.tsx', import.meta.url), 'utf8');

  assert.equal(desktopPrayerSrc.includes('prayer-stats-toggle'), false);
  assert.equal(desktopPrayerSrc.includes('prayer-stats-box'), false);
  assert.equal(desktopPrayerSrc.includes('Toplam Kılınan'), false);
  assert.equal(desktopPrayerSrc.includes('Namaz Rehberi'), true);

  assert.equal(mobilePrayerSrc.includes('mobile-prayer-stats-btn'), false);
  assert.equal(mobilePrayerSrc.includes('mobile-prayer-stats-panel'), false);
  assert.equal(mobilePrayerSrc.includes('Rehber'), true);
});

test('Genel Özet page and trigger buttons are removed on desktop and mobile while keeping live header layout', () => {
  const headerSrc = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const dashboardSrc = readFileSync(new URL('../src/components/Dashboard.tsx', import.meta.url), 'utf8');
  const sidebarSrc = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
  const mobileShellSrc = readFileSync(new URL('../mobile/src/MobileShellParts.tsx', import.meta.url), 'utf8');
  const mobileMainSrc = readFileSync(new URL('../mobile/src/main.tsx', import.meta.url), 'utf8');
  const mobileNavSrc = readFileSync(new URL('../mobile/src/MobileNav.tsx', import.meta.url), 'utf8');

  assert.equal(headerSrc.includes('Genel Özet'), false);
  assert.equal(headerSrc.includes('dashboard-overview-btn'), false);
  assert.equal(headerSrc.includes('<WeatherWidget />'), true);
  assert.equal(appSrc.includes('ActivityOverview'), false);
  assert.equal(sidebarSrc.includes('"overview"'), false);
  assert.equal(dashboardSrc.includes('live-status-overview'), true);

  assert.equal(mobileShellSrc.includes('Genel Özet'), false);
  assert.equal(mobileShellSrc.includes('mobile-head-action-btn'), false);
  assert.match(mobileShellSrc, /mobile-connection-pill[\s\S]*refresh-button/);
  assert.equal(mobileMainSrc.includes('MobileActivityOverview'), false);
  assert.equal(mobileNavSrc.includes('"overview"'), false);
});

test('monthly prayer summary computes weekday offset, leap years, elapsed counts and hybrid modal wiring', () => {
  const env = setupModules();
  const prayer = env.load('../shared/prayerTimes');

  assert.equal(prayer.shiftYearMonth('2026-01', -1), '2025-12');
  assert.equal(prayer.shiftYearMonth('2026-12', 1), '2027-01');

  const leapFeb = prayer.buildPrayerMonthSummary('2024-02', [], '2024-03-01');
  assert.equal(leapFeb.days.length, 29);
  assert.equal(leapFeb.leadingEmptyDays, 3); // 2024-02-01 Perşembe (Pzt=0..Per=3)
  assert.equal(leapFeb.elapsedDaysCount, 29);
  assert.equal(leapFeb.totalExpected, 145);

  const nonLeapFeb = prayer.buildPrayerMonthSummary('2025-02', [], '2025-02-10');
  assert.equal(nonLeapFeb.days.length, 28);
  assert.equal(nonLeapFeb.elapsedDaysCount, 10);
  assert.equal(nonLeapFeb.days[9].isToday, true);
  assert.equal(nonLeapFeb.days[10].isFuture, true);
  assert.equal(nonLeapFeb.totalExpected, 50);

  const novLogs = [
    {
      id: '2026-11-01',
      date: '2026-11-01',
      prayers: { fajr: 'prayed', dhuhr: 'prayed', asr: 'prayed', maghrib: 'prayed', isha: 'prayed' },
      notes: [],
      updatedAt: 1,
    },
    {
      id: '2026-11-05',
      date: '2026-11-05',
      prayers: { fajr: 'prayed', dhuhr: 'missed', asr: 'prayed', maghrib: 'prayed', isha: 'missed' },
      notes: [],
      updatedAt: 2,
    },
  ];
  const nov = prayer.buildPrayerMonthSummary('2026-11', novLogs, '2026-11-12');
  assert.equal(nov.days.length, 30);
  assert.equal(nov.leadingEmptyDays, 6); // 2026-11-01 Pazar (Pzt=0..Paz=6)
  assert.equal(nov.elapsedDaysCount, 12);
  assert.equal(nov.fullDaysCount, 1);
  assert.equal(nov.incompleteDaysCount, 11);
  assert.equal(nov.totalPrayed, 8);
  assert.equal(nov.totalExpected, 60);
  assert.equal(nov.totalMissed, 52);
  assert.equal(nov.days[0].prayedCount, 5);
  assert.equal(nov.days[4].prayedCount, 3);
  assert.equal(nov.days[11].isToday, true);
  assert.equal(nov.days[12].isFuture, true);

  const desktopPrayerSrc = readFileSync(new URL('../src/components/PrayerWidget.tsx', import.meta.url), 'utf8');
  const mobilePrayerSrc = readFileSync(new URL('../mobile/src/MobilePrayerCard.tsx', import.meta.url), 'utf8');
  const monthModalSrc = readFileSync(new URL('../src/components/PrayerMonthModal.tsx', import.meta.url), 'utf8');

  assert.equal(desktopPrayerSrc.includes('prayer-date-modal-trigger'), true);
  assert.equal(desktopPrayerSrc.includes('<PrayerMonthModal'), true);
  assert.equal(desktopPrayerSrc.includes('togglePrayerForDate'), true);

  assert.equal(mobilePrayerSrc.includes('mobile-date-modal-trigger'), true);
  assert.equal(mobilePrayerSrc.includes('<PrayerMonthModal'), true);
  assert.equal(mobilePrayerSrc.includes('currentRow?.version'), false);
  assert.equal(mobilePrayerSrc.includes('targetRow?.version'), true);

  assert.equal(monthModalSrc.includes('Aylık Namaz Çetelesi'), true);
  assert.equal(monthModalSrc.includes('pm-calendar-grid'), true);
  assert.equal(monthModalSrc.includes('pm-ledger-list'), true);
});

test('PhoneInbox helpers and modern grid layout support smart tabs, filtering, expiry and copy state', () => {
  const env = setupModules();
  const inbox = env.load('inboxHelpers');

  const now = 1_794_440_000_000;
  const sampleItems = [
    { id: '1', kind: 'text', title: 'Not 1', content: 'Şu özet işini hallet', mime: null, size: null, expiresAt: null, handled: 1, createdAt: now - 5000 },
    { id: '2', kind: 'link', title: 'Repo', content: 'https://example.com', mime: null, size: null, expiresAt: null, handled: 1, createdAt: now - 3000 },
    { id: '3', kind: 'file', title: 'ses.m4a', content: '', mime: 'audio/mp4', size: 2048, expiresAt: now + 2 * 86400_000, handled: 0, createdAt: now - 1000 },
    { id: '4', kind: 'file', title: 'resim.png', content: '', mime: 'image/png', size: 4096, expiresAt: now - 1000, handled: 1, createdAt: now - 8000 },
  ];

  // Smart tab selection
  assert.equal(inbox.resolveInitialInboxTab(sampleItems), 'pending');
  assert.equal(inbox.resolveInitialInboxTab(sampleItems.filter(i => i.handled === 1)), 'all');
  assert.equal(inbox.resolveInitialInboxTab([]), 'pending');
  assert.equal(inbox.resolveInitialInboxTab(sampleItems, '1'), 'all');

  // Summary & latest detection
  const summary = inbox.summarizeInboxItems(sampleItems, now);
  assert.equal(summary.total, 4);
  assert.equal(summary.pending, 1);
  assert.equal(summary.handled, 3);
  assert.equal(summary.counts.text, 1);
  assert.equal(summary.counts.link, 1);
  assert.equal(summary.counts.audio, 1);
  assert.equal(summary.counts.image, 1);
  assert.equal(summary.expiringSoon, 1);
  assert.equal(summary.expiredCount, 1);
  assert.equal(summary.latestItem.id, '3');

  // Search & type filtering
  const audioOnly = inbox.filterInboxItems(sampleItems, 'all', 'audio', '');
  assert.equal(audioOnly.filteredItems.length, 1);
  assert.equal(audioOnly.filteredItems[0].id, '3');
  assert.equal(audioOnly.typeCounts.link, 1);

  const searchRes = inbox.filterInboxItems(sampleItems, 'handled', 'all', 'özet');
  assert.equal(searchRes.filteredItems.length, 1);
  assert.equal(searchRes.filteredItems[0].id, '1');

  // UI & CSS contract checks
  const inboxSrc = readFileSync(new URL('../src/components/PhoneInbox.tsx', import.meta.url), 'utf8');
  const inboxCss = readFileSync(new URL('../src/components/phoneInbox.css', import.meta.url), 'utf8');
  const desktopLayoutCss = readFileSync(new URL('../src/desktop-layout.css', import.meta.url), 'utf8');

  assert.equal(inboxSrc.includes('inbox-kpi-grid'), true);
  assert.equal(inboxSrc.includes('inbox-toolbar'), true);
  assert.equal(inboxSrc.includes('✓ Kopyalandı'), true);
  assert.equal(inboxSrc.includes('Devamını gör'), true);
  assert.equal(inboxSrc.includes('İşlenenleri Temizle'), true);
  assert.equal(inboxSrc.includes("ACK AI'a Gönder"), false);
  assert.equal(inboxSrc.includes('opacity: item.handled'), false);

  assert.equal(inboxCss.includes('align-items: stretch;'), true);
  assert.equal(inboxCss.includes('repeat(4, minmax(0, 1fr))'), true);
  assert.equal(inboxCss.includes('repeat(3, minmax(0, 1fr))'), true);
  assert.equal(inboxCss.includes(':root[data-theme="light"] .main-content .inbox-card'), true);
  assert.equal(desktopLayoutCss.includes('.inbox-grid'), false);
});

test('desktop Notes redesign preserves persistence/shortcuts contract and uses modular CSS', () => {
  const notesTsx = readFileSync(new URL('../src/components/Notes.tsx', import.meta.url), 'utf8');
  const notesCss = readFileSync(new URL('../src/components/notes.css', import.meta.url), 'utf8');
  const desktopLayoutCss = readFileSync(new URL('../src/desktop-layout.css', import.meta.url), 'utf8');

  assert.equal(notesTsx.includes('notes-writing-sheet'), true);
  assert.equal(notesTsx.includes('id="note-title"'), true);
  assert.equal(notesTsx.includes('id="note-content"'), true);
  assert.equal(notesTsx.includes('id="notes-search"'), true);
  assert.equal(notesTsx.includes('✓ Kopyalandı'), true);
  assert.equal(notesTsx.includes('notes-delete-confirm'), true);
  assert.equal(notesTsx.includes('offerUndo'), true);
  assert.equal(notesTsx.includes('satır ·'), true);

  assert.equal(notesCss.includes('inset 3px 0 0 var(--app-accent)'), true);
  assert.equal(notesCss.includes('border: 0'), true);
  assert.equal(notesCss.includes(':root[data-theme="light"] .main-content .notes-page .notes-layout'), true);

  assert.equal(desktopLayoutCss.includes('.notes-layout'), false);
});

test('desktop mobileRelay parses history/messages safely, sends failed:true on missing key or errors, and App cleans processingAiIds in finally', async () => {
  const env = setupModules();
  const relay = env.load('mobileRelay');

  // 1. Parses Worker { prompt, history } JSON string and appends prompt
  const parsed1 = relay.parseRelayMessages({
    id: 'q1',
    prompt: 'Bugün ne var?',
    history: JSON.stringify([
      { role: 'user', text: 'Selam' },
      { role: 'model', text: 'Merhaba!' },
      { role: 'system', text: 'ignore me' },
      { role: 'user', text: '   ' },
    ]),
    model: 'fast',
  });
  assert.deepEqual(plain(parsed1), [
    { role: 'user', text: 'Selam' },
    { role: 'model', text: 'Merhaba!' },
    { role: 'user', text: 'Bugün ne var?' },
  ]);

  // 2. Malformed history JSON does not throw and preserves prompt
  const parsed2 = relay.parseRelayMessages({
    id: 'q2',
    prompt: 'Tek soru',
    history: '{broken-json',
    model: 'fast',
  });
  assert.deepEqual(plain(parsed2), [{ role: 'user', text: 'Tek soru' }]);

  // 3. Valid q.messages overrides history; empty/invalid q.messages falls back to prompt
  const parsed3 = relay.parseRelayMessages({
    id: 'q3',
    prompt: 'Yedek soru',
    messages: [{ role: 'user', text: 'Mesaj 1' }, { role: 'model', text: 'Cevap 1' }],
  });
  assert.deepEqual(plain(parsed3), [
    { role: 'user', text: 'Mesaj 1' },
    { role: 'model', text: 'Cevap 1' },
  ]);
  const parsed4 = relay.parseRelayMessages({
    id: 'q4',
    prompt: 'Yedek soru',
    messages: [{ role: 'system', text: 'bad' }],
  });
  assert.deepEqual(plain(parsed4), [{ role: 'user', text: 'Yedek soru' }]);

  // 4. executeRelayQuery handles missing key, valid reply, empty reply, and thrown errors with redaction + failed: true
  const replies = [];
  await relay.executeRelayQuery(
    { id: 'q-nokey', prompt: 'Soru', history: '[]', model: 'fast' },
    {
      hasKey: false,
      collectContext: async () => { throw new Error('Should not collect context'); },
      sendMessage: async () => { throw new Error('Should not call Gemini'); },
      sendReply: async (payload) => replies.push(payload),
    },
  );
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, 'q-nokey');
  assert.equal(replies[0].failed, true);
  assert.match(replies[0].reply, /Gemini API anahtarı/);

  let seenModel = null;
  let seenMessages = null;
  await relay.executeRelayQuery(
    { id: 'q-ok', prompt: 'Derslerim?', history: JSON.stringify([{ role: 'user', text: 'Merhaba' }]), model: 'powerful' },
    {
      hasKey: true,
      collectContext: async () => ({ context: [] }),
      sendMessage: async (msgs, model) => {
        seenMessages = msgs;
        seenModel = model;
        return { text: 'Yanıt ' + 'AIza' + 'SyDummySecretValue123456789012345' };
      },
      sendReply: async (payload) => replies.push(payload),
    },
  );
  assert.equal(seenModel, 'powerful');
  assert.equal(seenMessages.length, 2);
  assert.equal(replies[1].id, 'q-ok');
  assert.equal(replies[1].failed, undefined);
  assert.equal(replies[1].reply.includes('AIza'), false);

  await relay.executeRelayQuery(
    { id: 'q-empty', prompt: 'Boş', history: '[]', model: 'fast' },
    {
      hasKey: true,
      collectContext: async () => ({ context: [] }),
      sendMessage: async () => ({ text: '   ' }),
      sendReply: async (payload) => replies.push(payload),
    },
  );
  assert.equal(replies[2].id, 'q-empty');
  assert.equal(replies[2].failed, true);
  assert.ok(replies[2].reply.length > 0);

  await relay.executeRelayQuery(
    { id: 'q-err', prompt: 'Hata', history: '[]', model: 'fast' },
    {
      hasKey: true,
      collectContext: async () => ({ context: [] }),
      sendMessage: async () => { throw new Error('Hata ' + 'AIza' + 'SyDummySecretValue123456789012345 ' + 'x'.repeat(1200)); },
      sendReply: async (payload) => replies.push(payload),
    },
  );
  assert.equal(replies[3].id, 'q-err');
  assert.equal(replies[3].failed, true);
  assert.equal(replies[3].reply.includes('AIza'), false);
  assert.ok(replies[3].reply.length <= 1000);

  // 5. src/App.tsx uses executeRelayQuery / finally cleanup and never sends { error: ... }
  const appTsx = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.equal(appTsx.includes('executeRelayQuery'), true);
  assert.equal(/phoneRequest\("ai_reply",\s*\{\s*id:\s*q\.id,\s*error:/.test(appTsx), false);
  assert.equal((appTsx.match(/finally\s*\{[\s\S]{0,120}processingAiIds\.current\.delete\(/g) || []).length >= 2, true);
});

test('preferences normalizeStartPage and loadPreferences handle legacy and all 8 modern start pages', () => {
  const env = setupModules();
  const prefs = env.load('preferences');

  assert.deepEqual(
    plain(prefs.START_PAGES),
    ['home', 'tasks', 'calendar', 'notes', 'projects', 'ai', 'subscriptions', 'inbox'],
  );
  assert.deepEqual(plain(prefs.PC_REFRESH_INTERVALS), [2500, 5000, 10000]);

  assert.equal(prefs.normalizeStartPage('tools'), 'projects');
  assert.equal(prefs.normalizeStartPage('archive'), 'home');
  assert.equal(prefs.normalizeStartPage('unknown-page'), 'home');
  assert.equal(prefs.normalizeStartPage(null), 'home');

  for (const page of prefs.START_PAGES) {
    assert.equal(prefs.normalizeStartPage(page), page);
    env.storage.setItem(
      'ack-deck.preferences.v1',
      JSON.stringify({ startPage: page, pcRefreshMs: 5000, theme: 'dark' }),
    );
    assert.equal(prefs.loadPreferences().startPage, page);
    assert.equal(prefs.loadPreferences().pcRefreshMs, 5000);
  }

  env.storage.setItem(
    'ack-deck.preferences.v1',
    JSON.stringify({ startPage: 'tools', pcRefreshMs: 10000, theme: 'light' }),
  );
  assert.deepEqual(plain(prefs.loadPreferences()), {
    startPage: 'projects',
    pcRefreshMs: 10000,
    theme: 'light',
  });

  env.storage.setItem(
    'ack-deck.preferences.v1',
    JSON.stringify({ startPage: 'archive', pcRefreshMs: 9999 }),
  );
  assert.deepEqual(plain(prefs.loadPreferences()), {
    startPage: 'home',
    pcRefreshMs: 2500,
    theme: 'dark',
  });
});

test('backupStore round-trips modern startPage and 5 new HUB_BACKUP_KEYS while preserving legacy backup compatibility', async () => {
  const env = setupModules();
  const backup = env.load('backupStore');
  const prefs = env.load('preferences');
  const { DEFAULT_NOTIFICATION_PREFERENCES } = env.load('../shared/notificationPreferences');

  assert.equal(backup.HUB_BACKUP_KEYS.prayerConfig, 'ack-deck.prayer-config.v1');
  assert.equal(backup.HUB_BACKUP_KEYS.notificationPreferences, 'ack-deck.notification-preferences.v1');
  assert.equal(backup.HUB_BACKUP_KEYS.displayScale, 'ack-deck.display-scale.v1');
  assert.equal(backup.HUB_BACKUP_KEYS.weatherCity, 'ack-deck.weather-city.v1');
  assert.equal(backup.HUB_BACKUP_KEYS.pomodoro, 'ack-deck.pomodoro.v1');

  const desktop = { closeToTray: false, startInTray: false, autoStart: false };
  const samplePrayerConfig = {
    city: 'İstanbul',
    latitude: 41.0082,
    longitude: 28.9784,
    notifyAtTime: true,
    notifyBeforeMinutes: 15,
  };
  const sampleNotifPrefs = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    mobileMaster: false,
    desktopPomodoro: false,
  };
  const sampleDisplayScale = {
    defaultScale: 110,
    monitors: { 'name:Built-in': 105 },
  };
  const samplePomodoro = {
    mode: 'pomodoro',
    timeLeft: 900,
    completedSessions: 2,
    autoStartBreaks: true,
    isRunning: false,
    endTimeMs: null,
  };

  env.storage.setItem(
    'ack-deck.preferences.v1',
    JSON.stringify({ startPage: 'tasks', pcRefreshMs: 5000, theme: 'light' }),
  );
  env.storage.setItem('ack-deck.prayer-config.v1', JSON.stringify(samplePrayerConfig));
  env.storage.setItem('ack-deck.notification-preferences.v1', JSON.stringify(sampleNotifPrefs));
  env.storage.setItem('ack-deck.display-scale.v1', JSON.stringify(sampleDisplayScale));
  env.storage.setItem('ack-deck.weather-city.v1', JSON.stringify('İstanbul'));
  env.storage.setItem('ack-deck.pomodoro.v1', JSON.stringify(samplePomodoro));

  const created = backup.createBackup(desktop, '2.0.6');
  assert.equal(created.data.preferences.startPage, 'tasks');
  assert.equal(created.data.preferences.pcRefreshMs, 5000);
  assert.deepEqual(plain(created.data.prayerConfig), samplePrayerConfig);
  assert.deepEqual(plain(created.data.notificationPreferences), sampleNotifPrefs);
  assert.deepEqual(plain(created.data.displayScale), sampleDisplayScale);
  assert.equal(created.data.weatherCity, 'İstanbul');
  assert.deepEqual(plain(created.data.pomodoro), samplePomodoro);

  const parsed = backup.parseBackup(JSON.stringify(created));
  env.values.clear();

  await backup.restoreBackup(parsed, true, desktop, env.storage, async () => {});
  assert.deepEqual(plain(prefs.loadPreferences()), {
    startPage: 'tasks',
    pcRefreshMs: 5000,
    theme: 'light',
  });
  assert.deepEqual(JSON.parse(env.storage.getItem('ack-deck.prayer-config.v1')), samplePrayerConfig);
  assert.deepEqual(JSON.parse(env.storage.getItem('ack-deck.notification-preferences.v1')), sampleNotifPrefs);
  assert.deepEqual(JSON.parse(env.storage.getItem('ack-deck.display-scale.v1')), sampleDisplayScale);
  assert.equal(JSON.parse(env.storage.getItem('ack-deck.weather-city.v1')), 'İstanbul');
  assert.deepEqual(JSON.parse(env.storage.getItem('ack-deck.pomodoro.v1')), samplePomodoro);

  // Legacy v1 backup without the 5 new keys, with legacy startPage ("tools" / "archive") and legacy pomodoroHistory
  const makeLegacyBackup = (startPage) => ({
    formatVersion: 1,
    appVersion: '1.9.0',
    createdAt: '2026-10-01T10:00:00.000Z',
    data: {
      tasks: [],
      projects: [],
      notes: [],
      files: [],
      speedTest: null,
      archive: [],
      preferences: { startPage, pcRefreshMs: 2500 },
      aiModel: 'fast',
      desktop,
      pomodoroHistory: { '2026-10-01': 3 },
    },
  });

  const legacyToolsParsed = backup.parseBackup(JSON.stringify(makeLegacyBackup('tools')));
  env.values.clear();
  env.storage.setItem('ack-deck.weather-city.v1', JSON.stringify('Ankara'));
  await backup.restoreBackup(legacyToolsParsed, true, desktop, env.storage, async () => {});
  assert.equal(prefs.loadPreferences().startPage, 'projects');
  // Unrelated / absent optional keys must remain untouched when omitted from backup
  assert.equal(JSON.parse(env.storage.getItem('ack-deck.weather-city.v1')), 'Ankara');

  const legacyArchiveParsed = backup.parseBackup(JSON.stringify(makeLegacyBackup('archive')));
  await backup.restoreBackup(legacyArchiveParsed, true, desktop, env.storage, async () => {});
  assert.equal(prefs.loadPreferences().startPage, 'home');

  // Invalid startPage and invalid shapes for new keys must be rejected
  const baseValid = plain(created);
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, preferences: { startPage: 'unknown-page', pcRefreshMs: 2500, theme: 'dark' } },
    })),
    /geçersiz/i,
  );
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, weatherCity: 'Ankara\n' },
    })),
    /geçersiz/i,
  );
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, weatherCity: '   ' },
    })),
    /geçersiz/i,
  );
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, displayScale: { defaultScale: 120, monitors: {} } },
    })),
    /geçersiz/i,
  );
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, displayScale: { defaultScale: 100, monitors: { invalidKey: 100 } } },
    })),
    /geçersiz/i,
  );
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, prayerConfig: { ...samplePrayerConfig, latitude: 120 } },
    })),
    /geçersiz/i,
  );
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, notificationPreferences: { desktopMaster: 'yes' } },
    })),
    /geçersiz/i,
  );
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, pomodoro: { ...samplePomodoro, mode: 'focus' } },
    })),
    /geçersiz/i,
  );
  assert.throws(
    () => backup.parseBackup(JSON.stringify({
      ...baseValid,
      data: { ...baseValid.data, pomodoro: { ...samplePomodoro, timeLeft: -5 } },
    })),
    /geçersiz/i,
  );
});

test('Settings General tab exposes Başlangıç Sayfası and Sistem Durumu Yenileme Hızı controls', () => {
  const settingsTsx = readFileSync(new URL('../src/components/Settings.tsx', import.meta.url), 'utf8');

  assert.equal(settingsTsx.includes('Başlangıç Sayfası'), true);
  assert.equal(settingsTsx.includes('Sistem Durumu Yenileme Hızı'), true);
  assert.equal(settingsTsx.includes('START_PAGES'), true);
  assert.equal(settingsTsx.includes('PC_REFRESH_INTERVALS'), true);
  assert.equal(settingsTsx.includes('2,5 saniye'), true);
  assert.equal(settingsTsx.includes('5 saniye'), true);
  assert.equal(settingsTsx.includes('10 saniye'), true);
  assert.equal(settingsTsx.includes('Aylık Plan'), true);
  assert.equal(settingsTsx.includes('Gelenler'), true);
  assert.equal(settingsTsx.includes('Projeler & Araçlar'), true);
});

test('clampReminderText, pendingReminders, and useReminders clamp >160 Unicode scalar texts and drop empty items across all reminder sources', async () => {
  const events = [];
  let cleanup = null;
  const syncedBatches = [];
  const env = setupModules([], {
    adhan: adhanModule,
    events,
    react: {
      useEffect: (effect) => {
        cleanup = effect();
      },
    },
    invoke: async (command, args) => {
      if (command === 'sync_task_reminders') {
        syncedBatches.push(args.reminders);
        return [];
      }
      return null;
    },
  });

  const remindersMod = env.load('useReminders');

  // 1. Unit tests for clampReminderText (trim, ASCII, Turkish chars, emoji scalar counting, edge cases)
  assert.equal(remindersMod.clampReminderText('  Kısa görev  '), 'Kısa görev');
  assert.equal(remindersMod.clampReminderText('   \t\n  '), '');
  assert.equal(remindersMod.clampReminderText('Deneme', 0), '');
  assert.equal(remindersMod.clampReminderText('Deneme', -3), '');
  assert.equal(remindersMod.clampReminderText('🚀Deneme', 1), '🚀');
  assert.equal(remindersMod.clampReminderText('a'.repeat(160)), 'a'.repeat(160));

  const longAscii = 'a'.repeat(200);
  const clampedAscii = remindersMod.clampReminderText(longAscii);
  assert.equal(Array.from(clampedAscii).length, 160);
  assert.equal(clampedAscii, 'a'.repeat(159) + '…');

  const longTurkish = 'ğüşiöçĞÜŞİÖÇ'.repeat(20); // 240 scalar chars
  const clampedTurkish = remindersMod.clampReminderText(longTurkish);
  assert.equal(Array.from(clampedTurkish).length, 160);
  assert.equal(clampedTurkish.endsWith('…'), true);

  // Surrogate-pair emojis count as 1 Unicode scalar each (matching Rust .chars().count()), NOT 2 UTF-16 units
  const exactEmojiBoundary = '📌'.repeat(160); // .length === 320, scalar count === 160
  assert.equal(remindersMod.clampReminderText(exactEmojiBoundary), exactEmojiBoundary);

  const overEmoji = '🚀'.repeat(180); // .length === 360, scalar count === 180
  const clampedEmoji = remindersMod.clampReminderText(overEmoji);
  assert.equal(Array.from(clampedEmoji).length, 160);
  assert.equal(clampedEmoji, '🚀'.repeat(159) + '…');

  // Trailing whitespace before cut point is trimmed prior to ellipsis
  assert.equal(remindersMod.clampReminderText('abc   ' + 'x'.repeat(10), 6), 'abc…');

  // 2. pendingReminders clamps >250-char Unicode + emoji task alongside normal task and drops empty-text tasks
  const future = new Date(Date.now() + 30 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const dueDate = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`;
  const dueTime = `${pad(future.getHours())}:${pad(future.getMinutes())}`;
  const longTaskText = '  📚Vize_Hazırlık_' + 'ğüşiöç'.repeat(38) + '🚀'.repeat(15) + '  '; // >250 scalar chars
  const tasks = [
    { id: 'task-long', text: longTaskText, completed: false, dueDate, dueTime, priority: 'important', reminder: true },
    { id: 'task-ok', text: 'Kısa normal görev', completed: false, dueDate, dueTime, priority: 'normal', reminder: true },
    { id: 'task-empty', text: '   ', completed: false, dueDate, dueTime, priority: 'normal', reminder: true },
  ];

  const pending = remindersMod.pendingReminders(tasks);
  assert.equal(pending.length, 2);
  const longPending = pending.find(r => r.id === 'task-long');
  const okPending = pending.find(r => r.id === 'task-ok');
  assert.ok(longPending);
  assert.ok(okPending);
  assert.equal(Array.from(longPending.text).length, 160);
  assert.equal(longPending.text.endsWith('…'), true);
  assert.equal(okPending.text, 'Kısa normal görev');

  // 3. useReminders clamps all reminder sources (tasks, study, prayer, subscriptions) and filters empty items
  const taskStore = env.load('taskStore');
  assert.equal(taskStore.saveTasks(tasks, taskStore.loadTasks()), true);

  const studyStore = env.load('studyProgramStore');
  const studyReminderStore = env.load('studyReminderStore');
  assert.equal(studyStore.saveStudyPrograms([{
    ...sampleProgram,
    id: 'study-long',
    name: 'Program_' + 'Ö'.repeat(145),
    startDate: '2020-01-01',
    endDate: null,
    sessions: [{ id: 'ses-1', subject: 'Elektronik_2_Çalışma', topic: 'Op-Amp', weekdays: [1, 2, 3, 4, 5, 6, 7], time: '19:00', minutes: 60 }],
  }]), true);
  assert.equal(studyReminderStore.saveStudyReminder('study-long', 15), true);

  const subStore = env.load('subscriptionStore');
  const payDate = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  assert.equal(subStore.saveSubscriptions([{
    id: 'sub-long',
    name: 'Bulut_Abonelik_' + 'Ü'.repeat(140), // 155 chars; + " ödeme hatırlatması" => 172 chars > 160!
    category: 'Yazılım',
    amount: 199,
    currency: 'TRY',
    cycle: 'monthly',
    periodDays: 30,
    nextPayment: payDate,
    autoRenew: true,
    status: 'active',
    website: '',
    note: '',
    icon: '',
    reminderDays: 1,
    timezone: 'Europe/Istanbul',
    createdAt: 1,
    updatedAt: 1,
  }]), true);

  remindersMod.useReminders(() => {});
  await new Promise(resolve => setTimeout(resolve, 20));
  cleanup?.();

  assert.equal(syncedBatches.length >= 1, true);
  const batch = syncedBatches[syncedBatches.length - 1];
  assert.equal(batch.some(r => r.id === 'task-long'), true);
  assert.equal(batch.some(r => r.id === 'task-ok'), true);
  assert.equal(batch.some(r => r.id === 'task-empty'), false);
  assert.equal(batch.some(r => r.id === 'subscription:sub-long'), true);
  assert.equal(batch.some(r => r.id === 'study:study-long:ses-1'), true);
  assert.equal(batch.every(r => r.text.trim().length > 0 && Array.from(r.text).length <= 160), true);
  const syncedSub = batch.find(r => r.id === 'subscription:sub-long');
  assert.equal(Array.from(syncedSub.text).length, 160);
  assert.equal(syncedSub.text.endsWith('…'), true);
});

test('backupStore removes runtime palette IPC while preserving legacy paletteShortcut backup and journal compatibility', async () => {
  const sampleThreads = [
    { id: 'c1', title: 'Sohbet', createdAt: 100, updatedAt: 200, messages: [{ role: 'user', text: 'Merhaba' }] },
  ];
  const mockIndexedDB = {
    open: () => {
      const req = {
        result: {
          createObjectStore: () => {},
          transaction: () => {
            const tx = {
              objectStore: () => ({
                getAll: () => ({ result: sampleThreads }),
                get: () => ({ result: undefined }),
                delete: () => ({}),
                put: () => ({}),
                clear: () => ({}),
              }),
              oncomplete: null,
              onabort: null,
              onerror: null,
            };
            queueMicrotask(() => tx.oncomplete?.());
            return tx;
          },
          close: () => {},
        },
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  };

  const env = setupModules([], {
    indexedDB: mockIndexedDB,
    invoke: async (command) => {
      if (command.includes('palette')) {
        throw new Error('Unexpected palette command: ' + command);
      }
      if (command === 'get_gemini_models') {
        return { fast: 'gemini-3.5-flash-lite', powerful: 'gemini-3.8-flash' };
      }
      return undefined;
    },
  });

  const backup = env.load('backupStore');
  const tasks = env.load('taskStore');
  const desktop = { closeToTray: false, startInTray: false, autoStart: false };
  assert.equal(tasks.saveTasks([{ id: 't1', text: 'Palet testi', completed: false, priority: 'normal', reminder: false }], tasks.loadTasks()), true);

  const basic = backup.createBackup(desktop, '2.0.6');
  assert.equal('paletteShortcut' in basic.data, false);
  assert.equal('paletteRegistered' in basic.data, false);

  const full = await backup.createFullBackup(desktop, '2.0.6');
  assert.equal('paletteShortcut' in full.data, false);
  assert.equal('paletteRegistered' in full.data, false);
  assert.equal(env.calls.some(c => c.command.includes('palette')), false);
  assert.equal(env.calls.some(c => c.command === 'get_gemini_models'), true);

  const legacyWithPalette = {
    formatVersion: 1,
    appVersion: '2.0.0',
    createdAt: '2026-10-15T10:00:00.000Z',
    data: {
      tasks: [{ id: 'legacy-t1', text: 'Eski yedek görevi', completed: false, priority: 'normal', reminder: false }],
      projects: [],
      notes: [],
      files: [],
      speedTest: null,
      archive: [],
      preferences: { startPage: 'home', pcRefreshMs: 2500 },
      aiModel: 'fast',
      desktop,
      paletteShortcut: 'Ctrl+Space',
    },
  };

  const legacyParsed = backup.parseBackup(JSON.stringify(legacyWithPalette));
  const legacyNullParsed = backup.parseBackup(JSON.stringify({
    ...legacyWithPalette,
    data: { ...legacyWithPalette.data, paletteShortcut: null },
  }));
  assert.equal(legacyNullParsed.formatVersion, 1);

  const nativeCalls = [];
  const strictNative = async (command, args) => {
    nativeCalls.push({ command, args });
    if (command.includes('palette')) {
      throw new Error('Unexpected palette native command: ' + command);
    }
    return undefined;
  };

  env.values.clear();
  await backup.restoreBackup(legacyParsed, true, desktop, env.storage, strictNative);
  assert.equal(nativeCalls.some(c => c.command.includes('palette')), false);
  assert.equal(tasks.loadTasks().entries.length, 1);
  assert.equal(tasks.loadTasks().entries[0].id, 'legacy-t1');
  assert.equal(env.storage.getItem('ack-deck.restore-journal.v1'), null);

  // Legacy pending restore journal carrying paletteShortcut & paletteRegistered must recover cleanly without palette IPC
  const snapshot = Object.fromEntries(
    Object.values(backup.BACKUP_KEYS).map(k => [k, k === backup.BACKUP_KEYS.tasks ? '[]' : null]),
  );
  env.storage.setItem(
    'ack-deck.restore-journal.v1',
    JSON.stringify({
      formatVersion: 1,
      snapshot,
      desktop,
      paletteShortcut: 'Ctrl+Alt+Space',
      paletteRegistered: false,
    }),
  );

  nativeCalls.length = 0;
  await backup.recoverPendingRestore(env.storage, strictNative);
  assert.equal(nativeCalls.some(c => c.command.includes('palette')), false);
  assert.equal(tasks.loadTasks().entries.length, 0);
  assert.equal(env.storage.getItem('ack-deck.restore-journal.v1'), null);
});

test('hubLaunch.openRegisteredProject and ackActions work standalone after dead palette modules are removed', async () => {
  const deadFiles = [
    '../src/commandPalette.ts',
    '../src/paletteActions.ts',
    '../src/paletteRows.ts',
    '../src/usePaletteBridge.ts',
    '../src/components/LauncherPalette.tsx',
    '../src/components/PaletteWindow.tsx',
    '../src-tauri/src/palette.rs',
    '../src-tauri/capabilities/palette.json',
  ];
  for (const rel of deadFiles) {
    assert.equal(existsSync(new URL(rel, import.meta.url)), false, `Dead palette file still exists: ${rel}`);
  }

  const launched = [];
  const env = setupModules([
    ['ack-deck.projects.v1', JSON.stringify([
      { id: 'proj-1', name: 'ACKDeck', description: 'Ana proje', folderPath: 'C:\\Projects\\ack-deck' },
    ])],
  ]);
  const hubLaunch = env.load('hubLaunch');
  const actions = env.load('ackActions');

  assert.equal(typeof hubLaunch.openRegisteredProject, 'function');
  assert.equal(typeof hubLaunch.launchProject, 'function');

  const mockNative = async (command, args) => {
    launched.push({ command, args });
  };

  await hubLaunch.openRegisteredProject('proj-1', 'folder', mockNative);
  await hubLaunch.openRegisteredProject('proj-1', 'vscode', mockNative);
  assert.deepEqual(plain(launched), [
    { command: 'open_project_folder', args: { path: 'C:\\Projects\\ack-deck' } },
    { command: 'open_project_in_vscode', args: { path: 'C:\\Projects\\ack-deck' } },
  ]);

  await assert.rejects(() => hubLaunch.openRegisteredProject('proj-1', 'terminal', mockNative), /Proje işlemi geçersiz/);
  await assert.rejects(() => hubLaunch.openRegisteredProject('missing', 'folder', mockNative), /Kayıtlı proje klasörü bulunamadı/);
  await assert.rejects(
    () => hubLaunch.openRegisteredProject('proj-1', 'folder', async () => { throw new Error('boom'); }),
    /Proje açılamadı/,
  );

  const actionResult = await actions.executeAckAction(
    { type: 'open_project', projectId: 'proj-1', mode: 'vscode' },
    true,
    mockNative,
  );
  assert.equal(actionResult, "Kayıtlı proje VS Code'da açıldı.");
  assert.equal(launched[2].command, 'open_project_in_vscode');
});

function createTask8Vm(options = {}) {
  const values = new Map(options.initial ?? []);
  const modules = {};
  const events = options.events ?? [];
  const listeners = new Map();
  const intervals = [];
  const timeouts = [];
  const warnings = [];
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => values.delete(key),
  };
  const windowObj = {
    localStorage: storage,
    ...(options.windowFetch ? { fetch: options.windowFetch } : {}),
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event) => {
      events.push(event);
      for (const fn of listeners.get(event.type) ?? []) fn(event);
      return true;
    },
  };
  let nextTimerId = 1;
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = {};
    modules[name] = exports;
    const source = ts.transpileModule(
      readFileSync(new URL('../src/' + name + '.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const context = {
      exports,
      require: (id) => {
        if (id === 'adhan') return adhanModule;
        if (id === 'react' && options.react) return options.react;
        if (id === '@tauri-apps/api/core') return { invoke: options.invoke, isTauri: () => Boolean(options.tauri) };
        if (id === '@tauri-apps/api/app') return { getVersion: options.getVersion };
        if (id === '@tauri-apps/api/event') return { listen: async () => () => {} };
        return load(posix.normalize(posix.join(posix.dirname(name), id)));
      },
      crypto: webcrypto,
      URL,
      TextEncoder,
      structuredClone,
      indexedDB: options.indexedDB ?? new IDBFactory(),
      localStorage: storage,
      window: windowObj,
      document: options.document ?? { visibilityState: 'visible' },
      console: { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args), log: () => {} },
      Event,
      CustomEvent,
      Date,
      setTimeout: (fn, ms) => {
        const id = nextTimerId++;
        timeouts.push({ id, fn, ms, cleared: false });
        return id;
      },
      clearTimeout: (id) => {
        const t = timeouts.find((x) => x.id === id);
        if (t) t.cleared = true;
      },
      setInterval: (fn, ms) => {
        const id = nextTimerId++;
        intervals.push({ id, fn, ms, cleared: false });
        return id;
      },
      clearInterval: (id) => {
        const i = intervals.find((x) => x.id === id);
        if (i) i.cleared = true;
      },
      ...(options.hasFetch ? { fetch: options.fetch } : {}),
    };
    runInNewContext(source, context);
    return exports;
  }
  return { values, storage, window: windowObj, events, listeners, intervals, timeouts, warnings, load };
}

test('shared/dormMenu removes Tauri/CSP leaks, supports registerNativeDormFetcher and falls back to Worker cleanly', async () => {
  const dormSrc = readFileSync(new URL('../shared/dormMenu.ts', import.meta.url), 'utf8');
  assert.equal(dormSrc.includes('@tauri-apps/api/core'), false);
  assert.equal(dormSrc.includes('altinkalemkarabuk.com'), false);
  assert.equal(dormSrc.includes('__TAURI_INTERNALS__'), false);

  const cardSrc = readFileSync(new URL('../src/components/DormMenuCard.tsx', import.meta.url), 'utf8');
  const reminderSrc = readFileSync(new URL('../src/useDormMealReminder.ts', import.meta.url), 'utf8');
  assert.equal(cardSrc.includes('ensureDesktopDormFetcher'), true);
  assert.equal(reminderSrc.includes('ensureDesktopDormFetcher'), true);

  const fetchedUrls = [];
  const vm1 = createTask8Vm({
    hasFetch: true,
    fetch: async (url) => {
      fetchedUrls.push(url);
      if (url.startsWith('/api/dorm-menu')) {
        return {
          ok: true,
          json: async () => ({
            records: [{ id: 'w1', tarih: '2026-11-12', kahvalti: 'Peynir', aksam: 'Worker Çorba', yayinda: true }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    },
  });
  const dorm1 = vm1.load('../shared/dormMenu');
  assert.equal(typeof dorm1.registerNativeDormFetcher, 'function');

  let nativeCalls = 0;
  dorm1.registerNativeDormFetcher(async () => {
    nativeCalls += 1;
    return JSON.stringify({
      records: [{ id: 'n1', tarih: '2026-11-12', kahvalti: 'Zeytin', aksam: 'Native Kebap', yayinda: true }],
    });
  });
  const nativeRes = await dorm1.fetchDormMenu(true);
  assert.equal(nativeCalls, 1);
  assert.equal(nativeRes[0].aksam, 'Native Kebap');
  assert.equal(fetchedUrls.length, 0);

  // Without native fetcher, falls back to Worker /api/dorm-menu?force=1 first
  dorm1.registerNativeDormFetcher(null);
  const workerLocalRes = await dorm1.fetchDormMenu(true);
  assert.equal(fetchedUrls[0], '/api/dorm-menu?force=1');
  assert.equal(workerLocalRes[0].aksam, 'Worker Çorba');

  // If /api/dorm-menu fails, falls back to workers.dev Worker URL without throwing
  fetchedUrls.length = 0;
  const vm2 = createTask8Vm({
    hasFetch: true,
    fetch: async (url) => {
      fetchedUrls.push(url);
      if (url.startsWith('https://ack-deck-phone.ack-deck-cloud.workers.dev/api/dorm-menu')) {
        return {
          ok: true,
          json: async () => ({
            records: [{ id: 'w2', tarih: '2026-11-12', kahvalti: '', aksam: 'Workers.dev Pilav', yayinda: true }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    },
  });
  const dorm2 = vm2.load('../shared/dormMenu');
  const workerRemoteRes = await dorm2.fetchDormMenu(true);
  assert.deepEqual(fetchedUrls, [
    '/api/dorm-menu?force=1',
    'https://ack-deck-phone.ack-deck-cloud.workers.dev/api/dorm-menu?force=1',
  ]);
  assert.equal(workerRemoteRes[0].aksam, 'Workers.dev Pilav');

  // Non-Tauri environment without fetch never throws
  const vmNoFetch = createTask8Vm({ hasFetch: false });
  const dormNoFetch = vmNoFetch.load('../shared/dormMenu');
  const emptyRes = await dormNoFetch.fetchDormMenu(true);
  assert.deepEqual(plain(emptyRes), []);

  // Desktop registration helper wires invoke("fetch_dorm_menu") idempotently
  let desktopInvokeCount = 0;
  const vmDesktop = createTask8Vm({
    tauri: true,
    invoke: async (cmd) => {
      if (cmd === 'fetch_dorm_menu') {
        desktopInvokeCount += 1;
        return JSON.stringify({
          records: [{ id: 'd1', tarih: '2026-11-12', kahvalti: '', aksam: 'Desktop Menü', yayinda: true }],
        });
      }
      return null;
    },
  });
  const desktopDorm = vmDesktop.load('dormMenuDesktop');
  const dormShared = vmDesktop.load('../shared/dormMenu');
  desktopDorm.ensureDesktopDormFetcher();
  desktopDorm.ensureDesktopDormFetcher();
  const desktopRes = await dormShared.fetchDormMenu(true);
  assert.equal(desktopInvokeCount, 1);
  assert.equal(desktopRes[0].aksam, 'Desktop Menü');

  // Strict-mode browser/WebView2 check: window.fetch requires `this === window` (WebIDL receiver brand check)
  const vmBrand = createTask8Vm({
    hasFetch: false,
    windowFetch: async function (url) {
      if (this !== vmBrand.window) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      if (url.startsWith('/api/dorm-menu')) {
        return {
          ok: true,
          json: async () => ({
            records: [{ id: 'wb1', tarih: '2026-11-12', kahvalti: 'Simit', aksam: 'Brand Çorba', yayinda: true }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    },
  });
  const dormBrand = vmBrand.load('../shared/dormMenu');
  const brandRes = await dormBrand.fetchDormMenu(true);
  assert.equal(brandRes.length, 1);
  assert.equal(brandRes[0].aksam, 'Brand Çorba');
});

test('phoneSync snapshots once per sync page rather than once per incoming record and keeps multi-page state accurate', async () => {
  const env = setupModules();
  const phoneSync = env.load('phoneSync');
  const taskStore = env.load('taskStore');

  const origGetItem = env.storage.getItem;
  const getItemCounts = new Map();
  env.storage.getItem = (k) => {
    getItemCounts.set(k, (getItemCounts.get(k) ?? 0) + 1);
    return origGetItem(k);
  };

  const makeCloudTask = (id, text, version, deleted = false) => ({
    kind: 'tasks',
    id,
    version,
    deleted,
    updatedAt: version * 1000,
    data: deleted
      ? null
      : {
          text,
          completed: false,
          dueDate: null,
          dueTime: null,
          priority: 'normal',
          reminder: false,
          dueAt: null,
          timezone: 'Europe/Istanbul',
        },
  });

  const page1 = [
    makeCloudTask('sync-t1', 'Görev 1', 1),
    makeCloudTask('sync-t2', 'Görev 2', 1),
    makeCloudTask('sync-t3', 'Görev 3', 1),
    makeCloudTask('sync-t4', 'Görev 4', 1),
  ];

  const mockRequest = async (op, body) => {
    if (op === 'sync') {
      if (body.cursor === 0) return { records: page1, cursor: 4, more: false };
      return { records: [], cursor: body.cursor, more: false };
    }
    return { ok: true };
  };

  await phoneSync.synchronizePhone(mockRequest);
  // snapshot() reads ack-deck.notes.v1 once at sync start + once for the 4-record page = 2 (NOT 1 + 4 = 5)
  assert.equal(getItemCounts.get('ack-deck.notes.v1'), 2);
  assert.equal(taskStore.loadTasks().entries.length, 4);

  // Subsequent 2-page sync updating and deleting records keeps localRecords consistent (1 initial + 2 pages = 3 snapshots)
  getItemCounts.clear();
  const pagedRequest = async (op, body) => {
    if (op === 'sync') {
      if (body.cursor === 4) {
        return {
          records: [
            makeCloudTask('sync-t1', 'Görev 1 Güncel', 2),
            makeCloudTask('sync-t2', '', 2, true),
            makeCloudTask('sync-t5', 'Görev 5', 2),
          ],
          cursor: 7,
          more: true,
        };
      }
      if (body.cursor === 7) {
        return {
          records: [
            makeCloudTask('sync-t5', 'Görev 5 Revize', 3),
            makeCloudTask('sync-t6', 'Görev 6', 3),
            makeCloudTask('sync-t7', 'Görev 7', 3),
          ],
          cursor: 10,
          more: false,
        };
      }
    }
    return { ok: true };
  };

  const finalState = await phoneSync.synchronizePhone(pagedRequest);
  assert.equal(getItemCounts.get('ack-deck.notes.v1'), 3);
  assert.equal(finalState.conflicts.length, 0);
  const tasks = taskStore.loadTasks().entries;
  assert.equal(tasks.find((t) => t.id === 'sync-t1')?.text, 'Görev 1 Güncel');
  assert.equal(tasks.some((t) => t.id === 'sync-t2'), false);
  assert.equal(tasks.find((t) => t.id === 'sync-t5')?.text, 'Görev 5 Revize');
  assert.equal(tasks.length, 6);
});

test('usePhoneCompanion keeps heartbeat online while hidden/minimized and sends offline only on forceOffline or pause', async () => {
  const heartbeats = [];
  let cleanup = null;
  const vm = createTask8Vm({
    document: { visibilityState: 'hidden' },
    react: {
      useEffect: (fn) => {
        cleanup = fn();
      },
    },
    invoke: async (cmd, args) => {
      if (cmd === 'phone_status') {
        return { enabled: true, configured: true, url: 'https://my-custom.workers.dev' };
      }
      if (cmd === 'phone_request') {
        if (args.operation === 'heartbeat') heartbeats.push(args.body);
        if (args.operation === 'commands') return { commands: [] };
        if (args.operation === 'inbox') return { items: [] };
        if (args.operation === 'sync') return { records: [], cursor: 0, more: false };
        return { ok: true };
      }
      return null;
    },
  });

  const companion = vm.load('usePhoneCompanion');
  // visible=false + document.visibilityState==='hidden' must STILL stay online and schedule 20s heartbeatTimer
  companion.usePhoneCompanion(false, () => {}, false);
  await new Promise((r) => setTimeout(r, 20));

  assert.ok(heartbeats.length >= 1, 'Expected initial online heartbeat when hidden');
  assert.equal(heartbeats.every((hb) => hb.offline !== true), true);

  const hbInterval = vm.intervals.find((i) => i.ms === 20000 && !i.cleared);
  assert.ok(hbInterval, 'Expected 20s heartbeatTimer to remain active while !visible');

  const countBeforeTick = heartbeats.length;
  hbInterval.fn();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(heartbeats.length, countBeforeTick + 1);
  assert.equal(heartbeats.at(-1).offline !== true, true);

  // beforeunload triggers forceOffline
  for (const fn of vm.listeners.get('beforeunload') ?? []) fn();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(heartbeats.at(-1).offline, true);
  cleanup?.();

  // When paused=true (restore-lock), NO online heartbeat or 20s interval is scheduled
  heartbeats.length = 0;
  vm.intervals.length = 0;
  companion.usePhoneCompanion(true, () => {}, false);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(heartbeats.some((hb) => hb.offline !== true), false);
  assert.equal(vm.intervals.some((i) => i.ms === 20000 && !i.cleared), false);
});

test('useAutoBackup resolves dynamic app version via getVersion and dispatches ack-auto-backup-failed on errors', async () => {
  const savedPayloads = [];
  let shouldFailSave = false;
  let versionOverride = '2.0.9';
  let versionShouldFail = false;

  const createEnv = () =>
    createTask8Vm({
      tauri: true,
      react: {
        useEffect: (fn) => fn(),
        useRef: (init) => ({ current: init }),
      },
      getVersion: async () => {
        if (versionShouldFail) throw new Error('version unavailable');
        return versionOverride;
      },
      invoke: async (cmd, args) => {
        if (cmd === 'desktop_status') throw new Error('desktop_status failed');
        if (cmd === 'get_gemini_models') return { fast: 'gemini-3.5-flash-lite', powerful: 'gemini-3.8-flash' };
        if (cmd === 'save_auto_backup') {
          if (shouldFailSave) throw new Error('Disk dolu');
          savedPayloads.push(JSON.parse(args.content));
          return 'ACKDeck-AutoBackup-100.zip';
        }
        return null;
      },
    });

  // 1. Dynamic version from getVersion() used instead of hardcoded 1.7.0
  const vm1 = createEnv();
  vm1.load('useAutoBackup').useAutoBackup();
  const timer1 = vm1.timeouts.find((t) => t.ms === 15000);
  assert.ok(timer1);
  await timer1.fn();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(savedPayloads.length, 1);
  assert.equal(savedPayloads[0].appVersion, '2.0.9');
  assert.equal(vm1.events.some((e) => e.type === 'ack-auto-backup-completed'), true);

  // 2. When getVersion() also fails, fallback is 2.0.6 (never 1.7.0)
  savedPayloads.length = 0;
  versionShouldFail = true;
  const vm2 = createEnv();
  vm2.load('useAutoBackup').useAutoBackup();
  const timer2 = vm2.timeouts.find((t) => t.ms === 15000);
  await timer2.fn();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(savedPayloads.length, 1);
  assert.equal(savedPayloads[0].appVersion, '2.0.6');

  // 3. Failure keeps console.warn and dispatches ack-auto-backup-failed with detail.message
  shouldFailSave = true;
  const vm3 = createEnv();
  vm3.load('useAutoBackup').useAutoBackup();
  const timer3 = vm3.timeouts.find((t) => t.ms === 15000);
  await timer3.fn();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(vm3.warnings.length >= 1, true);
  const failEvent = vm3.events.find((e) => e.type === 'ack-auto-backup-failed');
  assert.ok(failEvent, 'Expected ack-auto-backup-failed CustomEvent');
  assert.match(failEvent.detail?.message ?? '', /Disk dolu/);
});

test('Task 9 Part A: NotificationSettings and DisplayScaleControls use modular semantic CSS tokens with zero hardcoded dark inline colors', () => {
  const cssPath = new URL('../src/components/notificationSettings.css', import.meta.url);
  assert.equal(existsSync(cssPath), true, 'Expected src/components/notificationSettings.css to exist');
  const cssSrc = readFileSync(cssPath, 'utf8');
  assert.match(cssSrc, /:root\[data-theme="light"\]/);
  assert.match(cssSrc, /var\(--app-text\)/);
  assert.match(cssSrc, /var\(--app-muted\)/);
  assert.match(cssSrc, /var\(--app-border\)/);

  const notifSrc = readFileSync(new URL('../src/components/NotificationSettings.tsx', import.meta.url), 'utf8');
  assert.match(notifSrc, /import\s+["']\.\/notificationSettings\.css["']/);
  for (const rel of [
    '../src/components/NotificationSettings.tsx',
    '../src/components/NotificationChannelGroup.tsx',
    '../src/components/NotificationDevicesCard.tsx',
  ]) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.doesNotMatch(
      src,
      /#(f1f5f9|a0b2c6|94a3b8|becbd8|e2e8f0|f8fafc|7ed492|60a5fa|fca5a5|4ade80|f87171|93c5fd)\b/i,
      `${rel} still contains hardcoded dark-theme inline hex color`,
    );
    assert.doesNotMatch(src, /rgba\(\s*255,\s*255,\s*255,\s*0\.0/, `${rel} still contains dark-theme white rgba`);
    assert.doesNotMatch(src, /rgba\(\s*15,\s*23,\s*42,\s*0\.4/, `${rel} still contains dark-theme slate rgba`);
  }

  const scaleSrc = readFileSync(new URL('../src/components/DisplayScaleControls.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(scaleSrc, /#94a3b8\b/i);
});

test('Task 9 Part C: normalizeRoute maps legacy desktop routes cleanly and Sidebar/App drop dead pc/archive views', () => {
  const navSrc = readFileSync(new URL('../src/navigation.ts', import.meta.url), 'utf8');
  const navExports = {};
  runInNewContext(
    ts.transpileModule(navSrc, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports: navExports },
  );

  assert.equal(typeof navExports.normalizeRoute, 'function', 'Expected normalizeRoute export from src/navigation.ts');
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'pc' })), { page: 'home' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'archive' })), { page: 'home' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'archive', id: 'a-1' })), { page: 'home', id: 'a-1' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'projects' })), { page: 'projects', tool: 'speed' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'projects', tool: 'ip', id: 'p-1' })), { page: 'projects', tool: 'ip', id: 'p-1' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'workspaces', id: 'w-1' })), { page: 'projects', tool: 'speed', id: 'w-1' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'tools' })), { page: 'projects', tool: 'speed' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'speed', intent: 'start-speed' })), { page: 'projects', tool: 'speed', intent: 'start-speed' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'qr' })), { page: 'projects', tool: 'qr' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'ip' })), { page: 'projects', tool: 'ip' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'files', id: 'f-1' })), { page: 'projects', tool: 'converter', id: 'f-1' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'tasks', id: 't-1', intent: 'new-task' })), { page: 'tasks', id: 't-1', intent: 'new-task' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'unknown-legacy' })), { page: 'home' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'constructor' })), { page: 'home' });
  assert.deepEqual(plain(navExports.normalizeRoute({ page: 'toString' })), { page: 'home' });

  const sidebarSrc = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
  const pageTypeMatch = sidebarSrc.match(/export type Page\s*=([\s\S]*?);/);
  assert.ok(pageTypeMatch, 'Expected export type Page in Sidebar.tsx');
  for (const legacy of ['"pc"', '"archive"', '"workspaces"', '"tools"', '"qr"', '"ip"', '"files"', '"speed"']) {
    assert.equal(pageTypeMatch[1].includes(legacy), false, `Sidebar Page union must not contain legacy route ${legacy}`);
  }

  const appSrc = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(appSrc, /normalizeRoute/);
  const pageViewsMatch = appSrc.match(/const pageViews:\s*Record<Page,\s*ReactNode>\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(pageViewsMatch, 'Expected pageViews map in App.tsx');
  for (const key of ['pc:', 'archive:', 'workspaces:', 'tools:', 'qr:', 'ip:', 'files:', 'speed:']) {
    assert.equal(pageViewsMatch[1].includes(key), false, `pageViews must not contain dead key ${key}`);
  }
  assert.equal(appSrc.includes('["qr", "ip", "speed", "tools", "workspaces", "files"]'), false);
});

test('Task 10 Fix Round 1: MediaFormModal suppresses initial lookup across StrictMode double-effect and does not swallow edits after identical-title candidate', async () => {
  const modalSrc = readFileSync(new URL('../src/components/MediaFormModal.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(modalSrc, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      jsxFactory: 'h',
      jsxFragmentFactory: 'fragment',
    },
  }).outputText;

  function mountModal(initialEditor, initialSuppressLookup) {
    const states = [];
    const refs = [];
    const effects = [];
    const cleanups = [];
    const pendingTimers = new Map();
    let timerId = 1;
    let stateIdx = 0;
    let refIdx = 0;
    let effectIdx = 0;
    let currentEditor = initialEditor;
    const lookupCalls = [];

    const hooks = {
      useState(init) {
        const slot = stateIdx++;
        if (!(slot in states)) states[slot] = typeof init === 'function' ? init() : init;
        return [states[slot], (next) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
      },
      useRef(init) {
        const slot = refIdx++;
        if (!(slot in refs)) refs[slot] = { current: init };
        return refs[slot];
      },
      useEffect(fn, deps) {
        const slot = effectIdx++;
        const prev = effects[slot];
        const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
        effects[slot] = { fn, deps, changed };
      },
    };

    const exports = {};
    const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
    const fakeWindow = {
      setTimeout(fn) {
        const id = timerId++;
        pendingTimers.set(id, fn);
        return id;
      },
      clearTimeout(id) {
        pendingTimers.delete(id);
      },
    };

    runInNewContext(compiled, {
      exports,
      h,
      fragment: 'fragment',
      window: fakeWindow,
      AbortController,
      Date,
      Promise,
      require: (id) => {
        if (id === 'react') return hooks;
        if (id === '../../shared/media') {
          return {
            MEDIA_TYPE_ICONS: { movie: '🎬', series: '📺', book: '📚', game: '🎮' },
            MEDIA_TYPE_LABELS: { movie: 'Film', series: 'Dizi', book: 'Kitap', game: 'Oyun' },
          };
        }
        if (id === '../../shared/mediaSearch') {
          return {
            searchMediaCatalog: async (type, q) => {
              lookupCalls.push({ type, q });
              return [{ title: 'Dune', suggestedType: 'movie', year: '2021', creator: 'Denis Villeneuve' }];
            },
            fetchMediaRating: async () => null,
          };
        }
        if (id === './MediaPoster') return { MediaPoster: () => null };
        throw new Error('Unexpected import: ' + id);
      },
    });

    const runEffects = (strictDouble = false) => {
      for (let i = 0; i < effects.length; i++) {
        if (!effects[i].changed) continue;
        cleanups[i]?.();
        cleanups[i] = effects[i].fn();
        if (strictDouble) {
          cleanups[i]?.();
          cleanups[i] = effects[i].fn();
        }
      }
    };

    const render = (strictDouble = false) => {
      stateIdx = 0;
      refIdx = 0;
      effectIdx = 0;
      const tree = exports.MediaFormModal({
        editor: currentEditor,
        isEditingExisting: initialSuppressLookup,
        initialSuppressLookup,
        onChangeEditor: (updater) => {
          currentEditor = typeof updater === 'function' ? updater(currentEditor) : updater;
        },
        onClose: () => {},
        onSave: () => {},
      });
      runEffects(strictDouble);
      return tree;
    };

    const flushTimers = async () => {
      for (const [id, fn] of [...pendingTimers.entries()]) {
        pendingTimers.delete(id);
        fn();
      }
      await new Promise((r) => setImmediate(r));
    };

    return {
      render,
      flushTimers,
      lookupCalls,
      setEditorTitle: (title) => { currentEditor = { ...currentEditor, title }; },
      setEditorType: (type) => { currentEditor = { ...currentEditor, type }; },
    };
  }

  // 1. StrictMode double-effect on initial edit keeps lookup suppressed; changing title clears suppression
  const m1 = mountModal({ id: 'm1', type: 'movie', title: 'Interstellar', status: 'completed', createdAt: 1, updatedAt: 1 }, true);
  m1.render(true);
  await m1.flushTimers();
  assert.equal(m1.lookupCalls.length, 0, 'StrictMode double-effect must not fire initial lookup when suppressed');
  m1.setEditorTitle('Interstellar 2');
  m1.render(false);
  await m1.flushTimers();
  assert.deepEqual(m1.lookupCalls, [{ type: 'movie', q: 'Interstellar 2' }]);

  // 2. Selecting candidate with identical type+title must not swallow subsequent user edit
  const m2 = mountModal({ id: 'm2', type: 'movie', title: 'Dune', status: 'planned', createdAt: 1, updatedAt: 1 }, false);
  m2.render(false);
  await m2.flushTimers();
  const tree2 = m2.render(false);
  assert.equal(m2.lookupCalls.length, 1);

  const findSuggestion = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (String(node.props?.className ?? '').includes('media-suggestion-item')) return node;
    for (const child of node.children?.flat(Infinity) ?? []) {
      const hit = findSuggestion(child);
      if (hit) return hit;
    }
    return null;
  };
  const sugBtn = findSuggestion(tree2);
  assert.ok(sugBtn, 'Expected suggestion button');
  sugBtn.props.onClick();
  m2.render(false);
  await m2.flushTimers();
  assert.equal(m2.lookupCalls.length, 1);

  m2.setEditorTitle('Dune 2');
  m2.render(false);
  await m2.flushTimers();
  assert.deepEqual(m2.lookupCalls, [
    { type: 'movie', q: 'Dune' },
    { type: 'movie', q: 'Dune 2' },
  ]);
});

test('Final Cleanup Wave: MediaCollectionView single IMDb badge + semantic delete contrast, NotificationSettings ref timer cleanup', () => {
  const mediaViewSrc = readFileSync(new URL('../src/components/MediaCollectionView.tsx', import.meta.url), 'utf8');
  assert.equal((mediaViewSrc.match(/className="media-imdb-badge"/g) || []).length, 2, 'Expected 1 IMDb badge in list view and 1 in grid view');
  assert.equal((mediaViewSrc.match(/media-delete-btn/g) || []).length, 2, 'Expected both Sil buttons to use .media-delete-btn');
  assert.doesNotMatch(mediaViewSrc, /#f87171/i);

  const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8');
  const lightCss = readFileSync(new URL('../src/styles/light-theme.css', import.meta.url), 'utf8');
  const mediaTrackerCss = readFileSync(new URL('../src/styles/media-tracker.css', import.meta.url), 'utf8');
  assert.match(appCss, /--app-danger:\s*#f87171;/);
  assert.match(lightCss, /--app-danger:\s*#b91c1c;/);
  assert.match(mediaTrackerCss, /\.media-delete-btn[\s\S]*var\(--app-danger/);

  const notifSrc = readFileSync(new URL('../src/components/NotificationSettings.tsx', import.meta.url), 'utf8');
  const notifLines = notifSrc.split(/\r?\n/).length;
  assert.ok(notifLines < 260, `Expected NotificationSettings.tsx < 260 lines, got ${notifLines}`);
  assert.match(notifSrc, /feedbackTimerRef\s*=\s*useRef/);
  assert.match(notifSrc, /clearFeedbackTimer\(\)/);
  assert.doesNotMatch(notifSrc, /return\s*\(\)\s*=>\s*clearTimeout\(timer\)/);
});
