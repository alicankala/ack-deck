import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const fixtureDir = fileURLToPath(new URL("../.test-fixtures/", import.meta.url));
mkdirSync(fixtureDir, { recursive: true });

const compiled = ts.transpileModule(readFileSync(new URL("../src/fileStore.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function store(storage, writable = true) {
  const exports = {};
  runInNewContext(compiled, {
    exports,
    window: { localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { if (!writable) throw new Error("quota"); storage.set(key, value); },
    } },
  });
  return exports;
}

const entry = (id, path, kind = "file") => ({ id, path, kind, name: "Kişisel kısayol", fileName: "örnek.txt", extension: kind === "file" ? "txt" : null, sizeBytes: kind === "file" ? 12 : null, modifiedAt: 1700000000000 });

test("file and folder shortcuts persist across reloads; renaming and removing preserve other data and real files", () => {
  const root = mkdtempSync(join(fixtureDir, "ackdeck-files-store-"));
  const path = join(root, "örnek.txt");
  writeFileSync(path, "ACKDeck test");
  try {
    const storage = new Map([["ack-deck.tasks.v1", "existing-tasks"], ["ack-deck.notes.v1", "existing-notes"]]);
    const first = store(storage);
    assert.equal(first.saveFiles([entry("file", path), entry("folder", root, "folder")]), true);
    const reloaded = store(storage);
    const loaded = reloaded.loadFiles();
    assert.equal(loaded.error, null);
    assert.equal(loaded.entries.length, 2);
    assert.equal(loaded.entries[0].path, path);
    loaded.entries[0].name = "Yeni görünen ad";
    assert.equal(reloaded.saveFiles(loaded.entries), true);
    assert.equal(store(storage).loadFiles().entries[0].name, "Yeni görünen ad");
    assert.equal(reloaded.saveFiles(loaded.entries.filter((item) => item.id !== "file")), true);
    assert.equal(store(storage).loadFiles().entries.length, 1);
    assert.equal(existsSync(path), true);
    assert.equal(readFileSync(path, "utf8"), "ACKDeck test");
    assert.equal(storage.get("ack-deck.tasks.v1"), "existing-tasks");
    assert.equal(storage.get("ack-deck.notes.v1"), "existing-notes");
  } finally {
    unlinkSync(path);
    rmdirSync(root);
  }
});

test("damaged data and unavailable storage fail safely without replacing existing records", () => {
  const malformed = "[{broken JSON";
  const storage = new Map([["ack-deck.files.v1", malformed]]);
  assert.notEqual(store(storage).loadFiles().error, null);
  assert.equal(storage.get("ack-deck.files.v1"), malformed);
  const valid = JSON.stringify([entry("file", "C:\\test\\örnek.txt")]);
  storage.set("ack-deck.files.v1", valid);
  assert.equal(store(storage, false).saveFiles([]), false);
  assert.equal(storage.get("ack-deck.files.v1"), valid);
  const invalidDate = JSON.stringify([{ ...entry("file", "C:\\test.txt"), modifiedAt: 9e15 }]);
  storage.set("ack-deck.files.v1", invalidDate);
  assert.notEqual(store(storage).loadFiles().error, null);
  assert.equal(storage.get("ack-deck.files.v1"), invalidDate);
});
