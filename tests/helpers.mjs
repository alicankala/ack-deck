import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import {posix} from 'node:path';
export function setupModules(initial = [], options = {}) {
  const values = new Map(initial), modules = {}, calls = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (options.failWrite?.(key, value)) throw new Error('quota'); values.set(key, value); }, removeItem: key => values.delete(key) };
  const invoke = async (command, args) => { calls.push({ command, args }); if (options.invoke) return options.invoke(command, args); return { cpuPercent: 18, ramUsedBytes: 8, ramTotalBytes: 16 }; };
  function load(name) {
    if (modules[name]) return modules[name]; const exports = {}; modules[name] = exports;
    const source = ts.transpileModule(readFileSync(new URL('../src/' + name + '.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, require: id => id === 'react' && options.react ? options.react : id === '@tauri-apps/api/core' ? { invoke } : id === '@tauri-apps/plugin-dialog' ? {} : load(posix.normalize(posix.join(posix.dirname(name),id))), crypto: webcrypto, URL, TextEncoder, structuredClone, ...(options.indexedDB ? { indexedDB: options.indexedDB } : {}), window: { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: options.events ? event => options.events.push(event) : undefined }, ...(options.events ? { Event, CustomEvent } : {}), Date, setTimeout, clearTimeout });
    return exports;
  }
  return { values, calls, storage, load };
}
