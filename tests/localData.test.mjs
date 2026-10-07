import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { setupModules } from "./helpers.mjs";
function load(name, values, writable = true) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../src/" + name + ".ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, require:name=>setupModules().load(name), window: { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { if (!writable) throw new Error("quota"); values.set(key, value); } } } });
  return exports;
}
test("preferences validate values and preserve the existing AI model preference", () => {
  const values = new Map([["ack-deck.ai-model.v1", "powerful"]]);
  const prefs = load("preferences", values);
  assert.equal(prefs.loadPreferences().pcRefreshMs, 2500);
  assert.equal(prefs.savePreferences({ startPage: "archive", pcRefreshMs: 5000 }), true);
  assert.equal(load("preferences", values).loadPreferences().startPage, "archive");
  assert.equal(load("aiModelPreference", values).getSavedAiModel(), "powerful");
  values.set("ack-deck.preferences.v1", '{"startPage":"unknown","pcRefreshMs":1}');
  assert.equal(prefs.loadPreferences().pcRefreshMs, 2500);
  assert.equal(prefs.loadPreferences().startPage, "home");
  assert.equal(load("preferences", values, false).savePreferences({ startPage: "home", pcRefreshMs: 2500 }), false);
});
test("legacy tasks are read without deleting the original key and migration occurs only on a valid write", () => {
  const legacy = JSON.stringify([{ id: "user-task", text: "Existing task", completed: false }]);
  const values = new Map([["kontrol-merkezi.tasks.v1", legacy]]);
  const api = load("taskStore", values);
  const loaded = api.loadTasks();
  assert.equal(loaded.entries[0].text, "Existing task");
  assert.equal(values.has("ack-deck.tasks.v1"), false);
  assert.equal(api.saveTasks(loaded.entries, loaded), true);
  assert.equal(values.get("kontrol-merkezi.tasks.v1"), legacy);
  assert.equal(load("taskStore", values).loadTasks().entries[0].id, "user-task");
});
test("tasks and projects preserve damaged records and block writes if the root cannot be read", () => {
  for (const [module, key, good, reader, writer] of [
    ["taskStore", "ack-deck.tasks.v1", { id: "t", text: "User task", completed: false }, "loadTasks", "saveTasks"],
    ["projectStore", "ack-deck.projects.v1", { id: "p", name: "User project", description: "Existing", folderPath: "C:\\work" }, "loadProjectSnapshot", "saveProjects"],
  ]) {
    const values = new Map([[key, JSON.stringify([good, { broken: "keep me" }])]]);
    const api = load(module, values); const loaded = api[reader]();
    assert.equal(loaded.entries.length, 1);
    assert.equal(api[writer](loaded.entries, loaded), true);
    assert.equal(JSON.parse(values.get(key))[1].broken, "keep me");
    values.set(key, "broken JSON");
    assert.equal(api[reader]().locked, true);
    assert.equal(api[writer]([], api[reader]()), false);
    assert.equal(values.get(key), "broken JSON");
  }
});
