import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
