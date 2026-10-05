import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, existsSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const fixtureDir = fileURLToPath(new URL("../.test-fixtures/", import.meta.url));
mkdirSync(fixtureDir, { recursive: true });

const code = ts.transpileModule(readFileSync(new URL("../src/archiveStore.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const KEY = "ack-deck.archive.v1";

function store(storage, { readable = true, writable = true } = {}) {
  const exports = {};
  runInNewContext(code, { exports, crypto: webcrypto, window: { localStorage: {
    getItem: (key) => { if (!readable) throw new Error("read failed"); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (!writable) throw new Error("quota"); storage.set(key, value); },
  } } });
  return exports;
}
const draft = { title: "Laptop faturası", category: "Fatura", description: "İş bilgisayarının faturası", date: "2026-08-12", tagsText: "laptop, garanti, önemli", file: null };
const plain = (value) => JSON.parse(JSON.stringify(value));

test("create, edit and reload preserve every field and creation time; deletion leaves the real attachment intact", () => {
  const root = mkdtempSync(join(fixtureDir, "ackdeck-archive-test-"));
  const path = join(root, "fatura.txt");
  writeFileSync(path, "Archive fixture");
  try {
    const storage = new Map([["ack-deck.notes.v1", "saved-notes"], ["ack-deck.files.v1", "saved-files"]]);
    const first = store(storage);
    const loaded = first.loadArchive();
    const entry = first.makeArchiveEntry({ ...draft, file: { path, fileName: "fatura.txt" } }, undefined, 1700000000000);
    assert.equal(first.saveArchive([entry], loaded), true);
    const next = store(storage);
    const reloaded = next.loadArchive();
    assert.deepEqual(plain(reloaded.entries[0]), plain(entry));
    const edited = next.makeArchiveEntry({ ...draft, title: "Güncellenmiş kayıt", file: entry.file }, entry, 1700000001000);
    assert.equal(edited.createdAt, entry.createdAt);
    assert.equal(edited.updatedAt, 1700000001000);
    assert.equal(edited.id, entry.id);
    assert.equal(next.saveArchive([edited], reloaded), true);
    assert.equal(store(storage).loadArchive().entries[0].title, "Güncellenmiş kayıt");
    assert.equal(next.saveArchive([], reloaded), true);
    assert.equal(store(storage).loadArchive().entries.length, 0);
    assert.equal(existsSync(path), true);
    assert.equal(readFileSync(path, "utf8"), "Archive fixture");
    assert.equal(storage.get("ack-deck.notes.v1"), "saved-notes");
    assert.equal(storage.get("ack-deck.files.v1"), "saved-files");
  } finally { unlinkSync(path); rmdirSync(root); }
});

test("title, description, tags and category search combine with the category filter locally", () => {
  const api = store(new Map());
  const invoice = api.makeArchiveEntry(draft);
  const device = api.makeArchiveEntry({ ...draft, title: "Telefon", category: "Cihaz", description: "Seri numarası", tagsText: "mobil", date: "" });
  const entries = [invoice, device];
  for (const query of ["Laptop", "İŞ", "garanti", "Fatura"]) assert.equal(api.filterArchive(entries, query, "all")[0].id, invoice.id);
  assert.equal(api.filterArchive(entries, "", "Cihaz")[0].id, device.id);
  assert.equal(api.filterArchive(entries, "garanti", "Cihaz").length, 0);
  assert.equal(api.filterArchive(entries, "", "all").length, 2);
});

test("optional fields remain optional; tags deduplicate and dates validate real calendar days", () => {
  const api = store(new Map());
  const entry = api.makeArchiveEntry({ ...draft, description: "", date: "", tagsText: "", file: null });
  assert.equal(entry.date, null);
  assert.equal(entry.file, null);
  assert.equal(entry.tags.length, 0);
  assert.deepEqual(plain(api.parseArchiveTags(" laptop, garanti, LAPTOP, , önemli ")), ["laptop", "garanti", "önemli"]);
  assert.equal(api.validArchiveDate("2026-02-30"), false);
  assert.equal(api.validArchiveDate("2024-02-29"), true);
  assert.equal(api.archiveDateLabel("2026-08-12"), "12.08.2026");
});

test("unreadable records do not hide valid entries and survive subsequent editing and saving", () => {
  const storage = new Map();
  const api = store(storage);
  const entry = api.makeArchiveEntry(draft);
  const broken = { id: "broken", title: "Recoverable original", updatedAt: "invalid" };
  storage.set(KEY, JSON.stringify([entry, broken, null]));
  const loaded = api.loadArchive();
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.preserved.length, 2);
  assert.equal(loaded.locked, false);
  assert.notEqual(loaded.warning, null);
  const edited = { ...loaded.entries[0], title: "Edited valid entry" };
  assert.equal(api.saveArchive([edited], loaded), true);
  assert.deepEqual(JSON.parse(storage.get(KEY))[1], broken);
  assert.equal(store(storage).loadArchive().entries[0].title, "Edited valid entry");
});

test("malformed storage, denied reads and quota failures never clear existing archive data", () => {
  const storage = new Map([[KEY, "broken JSON"]]);
  const api = store(storage);
  const loaded = api.loadArchive();
  assert.equal(loaded.locked, true);
  assert.equal(api.saveArchive([], loaded), false);
  assert.equal(storage.get(KEY), "broken JSON");
  assert.equal(store(storage, { readable: false }).loadArchive().locked, true);
  const entry = api.makeArchiveEntry(draft);
  const saved = JSON.stringify([entry]);
  storage.set(KEY, saved);
  const readonly = store(storage, { writable: false });
  assert.equal(readonly.saveArchive([], readonly.loadArchive()), false);
  assert.equal(storage.get(KEY), saved);
});
