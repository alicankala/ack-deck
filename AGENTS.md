# ACKDeck — Agent Guidance

## ACKDeck 1.1 iteration (2026-10-05)

The explicit user request supersedes the previous 1.0 feature freeze for subscriptions, recurring tasks/reminders and desktop/mobile simplification only. See `ITERATION_1_1.md` for implemented behavior, validation and remaining physical checks. Do not build a 1.1 Windows installer before the user's manual test/approval.

Subscriptions are stored under `ack-deck.subscriptions.v1` and use the existing versioned/idempotent/tombstone phone sync pipeline. `shared/recurrence.ts` is the common calendar/zone calculator; `shared/subscriptions.ts` contains tracking-only subscription validation/summary/reminder rules. No payment credentials, exchange-rate requests or combined-currency totals. Backup v1/v2 remain accepted, with optional subscription data and structured recurrence fields. Missing subscription sections never clear current data.

Cloud migration 0003 is additive: a subscription table and two reminder columns. Existing Cron, delivery ledger, Worker identity, D1/KV and paired-device/VAPID/owner credentials are retained. Cloud notification cursor advancement does not complete overdue tasks. Explicit completion advances only the current occurrence; snooze retains the original recurrence anchor/time. Legacy 1.0 clients receive compatible task/note views and cannot strip a stored recurrence; 1.1 clients identify schema 2 and re-read the sync cursor once while retaining versions/queues/tokens. Preserve this compatibility.

All user-facing text remains Turkish. Desktop logical UI scaling and palette isolation remain intact. Responsive matrix tests are structural, not rendered checks. Native GUI automation is unavailable (pipe error 2; empty browser inventory); no physical iPhone, keyboard, pixel/overflow or new native GUI result is implied by automated success.

## 1. Project identity

ACKDeck is a personal, local Windows desktop application built with:

- Tauri 2
- React 19
- TypeScript
- Vite
- npm
- Rust

The application is intended for one person and one Windows computer.

### Active project folder

Work only in:

`C:\Users\Alican\Desktop\Site ve Uygulama\ack-deck\`

The old folder:

`C:\Users\Alican\Desktop\Site ve Uygulama\kontrol-merkezi\`

is obsolete.

Do not modify, migrate, inspect, or use the obsolete folder unless the user explicitly asks for it.

### Product naming

Keep the product name:

**ACKDeck**

Use ACKDeck consistently in:

- User interface
- Window title
- Documentation
- Package metadata
- App icon / branding
- Installer / release metadata

Technical identifiers:

- npm package: `ack-deck`
- Cargo package: `ack-deck`
- Rust library: `ack_deck_lib`
- Tauri identifier: `com.alican.ackdeck`

Do not casually change the Tauri identifier because it affects installed-app identity, local app data, and Windows integration.

---

## 2. Product principles

ACKDeck should remain:

- Local-first
- Lightweight
- Fast
- Private
- Simple to maintain
- Windows-focused
- Useful for one person rather than designed as a public SaaS product

Do not add unless the user explicitly requests them:

- Android support
- iOS support
- User accounts
- Login systems
- Servers
- Cloud sync
- Telemetry
- Analytics
- Advertising
- Multi-user functionality
- Subscription systems
- Paid cloud dependencies

Do not turn ACKDeck into a web service.

Prefer local storage and native Windows/Tauri capabilities where appropriate.

---

## 3. Current architecture

### Frontend

The frontend uses React + TypeScript.

`src/App.tsx` should primarily compose pages and application-level layout.

Feature components belong under:

`src/components/`

Do not put large new features entirely inside `App.tsx`.

Shared styling currently lives mainly in:

`src/App.css`

Keep components reasonably focused and typed.

### Backend

The Tauri/Rust application is under:

`src-tauri/`

Make focused Rust changes only when a requested feature requires:

- Windows integration
- Secure credential handling
- Filesystem access
- System information
- Native dialogs
- Opening applications or folders
- Network requests that should not expose secrets to the frontend

Do not rewrite or replace the existing Tauri project.

---

## 4. Existing implemented features

### Dashboard

The basic ACKDeck dashboard is implemented.

`Dashboard.tsx` is a daily-work overview: compact date/time, an ACK AI message starter, up to five overdue/today/next tasks, Continue, up to three workspaces, compact shortcuts and an expandable PC strip. Management filters/editors stay on detail pages. Dashboard submissions use the existing ACK AI send/approval pipeline once; no separate AI backend exists. PC polling retains its existing visibility and refresh rules.

`recentStore.ts` keeps at most twenty references under `ack-deck.recent-items.v1` and resolves up to five current records for Continue. Successful workspace/project/shortcut/file opens, note edits and archive views supply references; no file contents or copied record bodies are stored. Deleted references are omitted, note timestamps reflect current edits, and damaged recent storage is preserved without overwriting it.

Dashboard validation: frontend build and all 57 Node tests passed, including message handoff/approval, daily task ordering, recent persistence/navigation, project-opening failures and the unchanged PC refresh/cleanup. Responsive breakpoints are implemented; actual window resizing and live Gemini interaction were not manually verified.

Preserve the current dark visual language unless the user explicitly requests a redesign.

### Clock and date

The clock and Turkish date are derived from the frontend system time.

### Tasks

`Tasks.tsx` currently supports:

- Add/edit tasks with optional date, time, normal/important priority and reminder
- Complete task
- Delete task
- localStorage persistence

Existing user tasks must not be lost.

There is also legacy storage-key migration logic.

Preserve backward compatibility when changing task persistence.

Never silently wipe existing stored data.

Reminders use the official Tauri notification plugin and a sleeping native queue while ACKDeck is running, including tray mode. Synchronizing tasks replaces pending reminders; a versioned native delivery ledger prevents repeat dispatch after restart. Do not introduce notification polling or claim notifications run while the app is fully closed. Windows toast clicks are not routed to Tasks in this version.

### Workspaces, shortcuts and global palette

`workHubStore.ts` stores workspaces under `ack-deck.workspaces.v1` and shortcuts under `ack-deck.shortcuts.v1`. A workspace contains saved project IDs or native-selected target IDs. Shortcuts compatibly merge the original `ack-deck.files.v1` records without rewriting/deleting that key. Legacy exclusions and shortcut entries share one atomic envelope; failed removal cannot hide the legacy record. Damaged roots block writes.

`launch_targets.rs` registers native-picked file/folder/executable targets and explicitly entered http/https URLs in native `launch-targets.v1.json`. New launches accept saved IDs only, never arbitrary executable paths or arguments. Applications must be selected through the native picker; script/command hosts are blocked. Old executable/script file shortcuts remain stored but cannot be launched as ordinary file shortcuts; reselect allowed apps using the application picker. Project opening continues through the original registered-project/backend flow. Workspace failures are isolated per item.

`usageStore.ts` stores bounded reference-only usage/pin metadata under `ack-deck.usage.v1`; ranking is deterministic Turkish-normalized exact/prefix/word/substring matching plus pin/recency/frequency bonuses. No disk indexing exists.

`palette.rs` uses the official global-shortcut plugin for Ctrl+Alt+Space. The separate `palette` webview is hidden initially, centered, always on top and absent from the taskbar. Escape/close hides it; normal main-window close still exits unless close-to-tray is enabled. Its creation runs off the setup thread after main-window restore, avoiding a second WebView2 controller blocking startup. Ctrl+K uses the same focused `LauncherPalette.tsx` interface in-app. The tray offers Hızlı Erişim; System Check reports registration/window readiness when the global key is occupied.

`usePaletteBridge.ts` serializes global palette actions through the main webview, including quick captures, so the palette never writes primary records itself. Task/note captures use the existing stores and stable request IDs for retry deduplication. Restore journals block palette effects; failed captures retain input. Workspace/shortcut AI proposals use saved IDs and current-record snapshots, always require confirmation and report actual partial failures. No shell, file-content or credential tools were added.

Backup v1 accepts optional workspace/shortcut/usage fields; older backups and recovery journals remain readable, and restoring older backups leaves new stores untouched. Native target authorization is deliberately not imported from backup JSON: restored records can use existing native IDs on this computer; missing targets/apps must be picked again. Credentials remain excluded.

Daily usability stages 1–10 are implemented. Final validation: frontend build and all 74 Node tests; cargo fmt --check, cargo check --locked and all 14 Rust tests; release source audit passed. Tauri dev served HTTP 200, native startup confirmed main visibility and creation of the hidden palette webview, and the process responded. Temporary diagnostics were removed and all verification processes stopped. No installer was built. Computer Use could not connect to its native pipe (os error 2): actual global key presses, native pickers/app launches, tray interaction, resize/accessibility and live Gemini round-trip remain manual checks, not claimed passed.

### Projects

`Projects.tsx` supports adding, editing, deleting, and persisting projects in localStorage. Existing user projects remain editable/removable; missing storage starts empty rather than generating demo entries. Folder selection uses the Tauri dialog plugin; Rust checks and opens folders or VS Code.

### PC Status

`PcStatus.tsx` polls the Rust backend at the selected 2.5/5/10-second interval while the dashboard/window is visible. The backend reads real Windows CPU, RAM, system-drive, and connection status data. Unavailable values are shown honestly.

### Quick Tools

`Tools.tsx` opens Local Notes, QR creation, IP information, Files, and Speed Test from both the dashboard and the tools page.

`Files.tsx` manages local file/folder shortcuts, display names, search, and removal from the ACKDeck list. Only paths and metadata are persisted under `ack-deck.files.v1` in localStorage. Native selection uses the existing dialog plugin; Rust checks metadata and missing paths, reuses the project-folder opening command for folders, and uses the existing opener plugin for files and Explorer selection. No file contents, filesystem deletion, scanning, watchers, or polling are part of this feature.

Implement Quick Tools only when specifically requested.

`SpeedTest.tsx` uses the official `@cloudflare/speedtest` engine (currently 1.14.1), loaded and started only by a button click. It shows download/upload Mbps and unloaded latency/jitter in ms, labels live values as provisional, and stores only the last valid successful result in `ack-deck.speed-test.v1`. Optional Cloudflare result/measurement logging, loaded-latency probes, and TURN/packet-loss phases are disabled. Cancellation, errors, completion, and unmount pause the engine and detach callbacks. There is no polling or custom Rust speed-test backend. Validation covered the frontend build, eight automated lifecycle/storage tests (including in-flight request cancellation using the installed engine), and HTTP 200 responses from both Cloudflare measurement endpoints. A full live browser measurement could not be checked because no automation browser was available.

### Archive

`Archive.tsx` provides a local catalog of important records with title, fixed category, description, optional date/tags, and one optional linked file. Entries support details, editing, confirmed record-only deletion, local search, and category filtering. `archiveStore.ts` stores record data and the linked file's name/path under `ack-deck.archive.v1`; file contents are never stored. Readable records remain visible when individual records are damaged, and unreadable records are preserved on subsequent saves. Unreadable root storage blocks writes. `ArchiveFileLink.tsx` reuses the existing `check_file_entries` and `access_file_entry` Rust commands; file selection uses the existing dialog plugin. No Rust, dependency, AI, or network changes were needed. Validation: frontend build, five archive persistence/filter/data-safety tests, and Tauri startup passed. Native file-picker/opening flows were not manually verified because Windows/browser automation was unavailable.

### ACK AI

`AckAi.tsx` provides Gemini chat with minimal relevant local context and source labels. `ackIntegration.ts` uses narrow read tools and shared local search to select records/snippets; general chat carries no new local dataset. `ackActions.ts` validates task/note/archive actions, registered-project opening, navigation and speed-test proposals. Local intent parsing and fifteen allowlisted Gemini function declarations prepare drafts only. Every state/native action requires the real Onayla card; internal navigation does not. Record snapshots reject intervening edits, and success follows actual persistence/native success. There is no autonomous tool loop, shell, arbitrary path/program, implicit file-content, or credential tool. Rust validates context source names/size and tool arguments and redacts the credential from context, messages, and replies. Gemini model IDs remain centralized in `src-tauri/src/gemini_models.rs`.

The user can choose between a fast and a more powerful Gemini mode.

Frontend model labels may be user-friendly, but actual Gemini model IDs must remain centralized in:

`src-tauri/src/gemini_models.rs`

Do not scatter Gemini model IDs throughout the frontend or Rust code.

### Gemini API key

`Settings.tsx` lets the user enter the Gemini API key.

The key is handled through the Rust/Tauri backend and stored in Windows Credential Manager.

Security requirements:

- Never hardcode the API key.
- Never commit the API key.
- Never place it in frontend localStorage.
- Never place it in source-controlled `.env` files.
- Never log it.
- Never include it in error messages.
- Never return it to the frontend.
- Never expose it through debug output.

Gemini requests must only happen after an explicit user action.

Do not create continuous or background AI requests.

### Windows tray and startup

`desktop.rs` creates the existing-icon tray and handles restore/AI/new-task/Exit. Close-to-tray and official autostart default off. Startup preferences are versioned in the native app config because they must be read before window creation. Registration changes only after explicit Settings/confirmed restore actions. Autostart launches may remain hidden; manual and second-instance launches restore the window. Hidden/minimized feature components unmount, stopping monitoring and active speed tests. The single-instance plugin prevents duplicate reminder processes.

### Local search, backup, and diagnostics

`localSearch.ts` queries only saved task/project/note/file/archive records; `GlobalSearch.tsx` combines these results with commands under Ctrl+K. Dynamic project commands resolve only saved IDs using the existing native project commands.

`backupStore.ts` exports an explicit known-data allowlist, excluding credentials/runtime state/real file contents. Restore validates version-1 and version-2 schemas, requires confirmation, snapshots old data first, locks UI/reminder registration, and rolls back on failure. Never delete an unfinished recovery journal: startup must recover it before mounting, or block writes if recovery fails. Native dialogs in `backup.rs` select/save backup JSON; do not add arbitrary path reading as an AI tool.

About/System Check shows boolean readiness only. It must not expose credentials or trigger AI/public-IP requests or file opening.

ACKDeck should not require paid Gemini billing unless the user explicitly requests paid API usage.


### ACK visual mark and persistent AI history

The application/product name remains ACKDeck; the geometric visual mark is ACK. The source mark is public/ack-mark.svg and the existing Tauri icon pipeline generates the Windows ICO and bundle PNG assets. The tray uses the same default window icon. Do not rename package metadata or identifiers to ACK.

ACK AI threads use IndexedDB database ack-deck.conversations.v1, with visible messages and minimal attachment metadata only. Titles and history search are local. No previous RAM-only chat can be reconstructed; there was no persisted legacy history to migrate. Quota errors preserve current in-memory messages, show a retry, and block backups that would omit failed writes. Do not store system prompts, tool arguments, pending confirmations, credentials, or attachment contents. Full local history remains visible; requests carry at most 20 recent messages within an 18 KB UTF-8 budget. No background summaries are generated.

Deterministic navigation/capture and recognized saved-target drafts are local. Palette AI fallback is an explicit selection; typing never contacts Gemini. Gemini returns at most one validated action draft (no tool loop), searches return at most eight records, and source/payload/native timeouts are bounded. Confirmation tickets are consumed before effects, expire after five minutes, and reject reuse, cancellation, altered parameters and changed referenced records/projects.

File/image analysis accepts only explicit native-picker selections or pasted PNG/JPEG/WebP images. Rust holds temporary selected-ID buffers for ten minutes, at most 8 MB each (UTF-8 TXT: 128 KB). Supported types: PNG/JPEG/WebP, PDF, UTF-8 TXT. Local image previews appear before Send; only Send transmits file parts through the existing Gemini backend. No generic AI filesystem tool, linked-file auto-reading, or screen capture exists. History/backup stores only file name/MIME/size; never buffers, previews, paths to arbitrary files, or selection IDs.

Global Palette hotkeys may be changed live in Settings using the existing official plugin; conflicts preserve the old registration. The native versioned hotkey preference is included in backups. Recovery preserves a previously unregistered/conflicted shortcut state. Tasks, notes, archive, shortcuts and workspaces have a 10-second in-memory record-only Undo; confirmations and real linked files remain intact.

Backup format 2 includes threads, workspace/shortcut/pin/recent metadata and hotkey preferences. Version 1 remains accepted; missing newer sections do not clear them. IndexedDB recovery snapshots and the existing localStorage recovery journal coordinate rollback/startup recovery. Never discard an unfinished journal or export a partial history after failed writes. Settings explains intentional network use; no telemetry or analytics was added.

---

## 5. Data safety

User data is more important than implementation convenience.

When modifying persistence:

- Preserve existing tasks.
- Preserve existing project entries.
- Preserve saved preferences.
- Preserve credentials.
- Migrate old formats when practical.
- Avoid destructive schema changes.

Do not clear localStorage or other app storage as a shortcut.

Do not reset application data unless the user explicitly asks.

If a migration is necessary:

1. Read the old data.
2. Convert it safely.
3. Verify the new format.
4. Only then stop using the old format.

Prefer backward-compatible migrations.

SQLite is not mandatory.

Introduce SQLite only when the application's data model becomes complex enough that it provides a real benefit over the existing storage approach.

---

## 6. Windows integration

ACKDeck currently targets Windows.

Prefer proper Tauri/Rust or supported Tauri plugins for operations such as:

- Selecting folders
- Opening folders
- Launching applications
- Reading system information
- Native dialogs
- Credential storage
- Filesystem operations

Do not rely on unsafe browser tricks for native Windows behavior.

Handle missing paths and missing programs gracefully.

Examples:

If a project folder no longer exists:

`Klasör bulunamadı`

If VS Code cannot be launched:

`VS Code bulunamadı`

The application must not crash because an external folder, application, device, or network resource is unavailable.

---

## 7. Performance

ACKDeck should remain lightweight.

Avoid:

- High-frequency polling
- Busy loops
- Unnecessary background processes
- Large frameworks for small features
- Heavy dependencies without clear benefit
- Constant AI requests
- Constant network requests

For live system information, a refresh interval around 2–3 seconds is generally sufficient unless the user requests something different.

Clean up:

- timers
- listeners
- subscriptions
- background tasks

when components unmount or pages change.

Do not make the monitoring feature itself cause noticeable CPU or RAM usage.

---

## 8. Network behavior

Network access should be intentional.

Do not add automatic external requests unless required by an implemented feature.

For network-powered features:

- Explain failures honestly.
- Avoid silent background retries.
- Avoid aggressive polling.
- Respect API limits.
- Do not introduce paid services without explicit permission.

If a feature can work locally without meaningfully harming usability, prefer the local implementation.

---

## 9. UI and UX conventions

Preserve the current ACKDeck visual style:

- Dark charcoal surfaces
- Clear but subtle borders
- Restrained blue accent
- High-contrast text
- Minimal gradients
- Light hover effects
- Clean spacing
- Calm, desktop-oriented appearance

Avoid:

- RGB/gaming aesthetics
- Excessive glass effects
- Large flashy animations
- Excessive gradients
- Unnecessary card movement
- Mobile-first layouts that make the Windows desktop app feel like a phone app

The UI must remain usable when the Tauri window is resized.

Use Turkish for user-facing text unless the user asks otherwise.

Keep keyboard operation and accessibility labels functional.

Use native-looking behavior where practical.

---

## 10. Dependency policy

Prefer:

1. Existing project dependencies
2. Native browser APIs
3. Existing Tauri capabilities
4. Small, well-maintained packages

before adding new dependencies.

Add a dependency only when it materially improves the requested feature.

Before adding a package, consider whether the same result can be achieved cleanly with existing dependencies.

Do not introduce a large framework for a small utility.

Do not replace the current architecture simply because another library is fashionable.

---

## 11. Change discipline

Before editing:

1. Read the files relevant to the requested feature.
2. Understand the existing implementation.
3. Make the smallest coherent change that satisfies the request.

Avoid unrelated refactors.

Do not rewrite working components without a concrete reason.

Do not rename large parts of the project unless requested.

Do not implement future roadmap items merely because they are listed in this file.

The user's current request always has priority over the roadmap.

When the current task is complete, stop.

Do not automatically continue to the next roadmap item.

---

## 12. Error handling

User-facing errors should be:

- Short
- Clear
- In Turkish
- Non-technical when possible

Do not expose:

- API keys
- Rust backtraces
- Internal paths unnecessarily
- Raw backend errors when a clearer message can be provided

Internal failures should not crash the whole application if graceful fallback is possible.

For unavailable values, prefer:

`--`

or:

`Alınamadı`

depending on context.

---

## 13. Validation

Do not run a full build after every tiny change.

Use validation proportional to the risk.

### Frontend

Run:

`npm run build`

when:

- A meaningful frontend feature is completed
- TypeScript changes are substantial
- Routing/state architecture changes
- Before a release
- The user asks for a build check
- A change could plausibly break bundling

For small CSS or copy changes, focused inspection is enough unless there is a concrete risk.

### Rust / Tauri

From `src-tauri`, run:

`cargo check --locked`

when:

- Rust code changes
- Cargo dependencies change
- Tauri configuration changes
- Native integration changes
- Compilation risk exists

Do not repeatedly run it for unrelated frontend-only edits.

### Runtime inspection

Use:

`npm run tauri dev`

when actual Windows integration or visual behavior needs runtime verification.

If a development server is started only for verification, stop it afterward.

---

## 14. Definition of done

A roadmap item should only be marked complete when:

1. The requested behavior is implemented.
2. Existing related data is preserved.
3. Main error cases are handled.
4. Relevant validation has been performed.
5. The UI accurately reflects the real behavior.
6. No placeholder remains for the completed feature unless explicitly documented.

Do not mark an item complete merely because the UI exists.

---

## 15. Reporting style

After completing work, keep the response concise.

Normally report:

1. What changed
2. Important files changed
3. What was actually tested
4. Any remaining limitation
5. The next roadmap item, if relevant

Do not paste large amounts of code unless the user asks.

Do not produce long implementation essays after every task.

---

## Display scaling and monitor preferences

Main-window UI sizing uses the original 15px baseline, root --ui-scale and shared --ui-unit/design tokens. Keep responsive breakpoints and the 1800px content cap in logical CSS dimensions; never use physical monitor resolution as a layout breakpoint. The compact palette owns a 1px sizing unit and does not inherit main-window scaling. Native tray/menu assets are unaffected.

Display preferences are isolated in ack-deck.display-scale.v1 (defaultScale and monitor overrides), preserving existing preference/backup behavior. Named monitors use their native device name; unnamed monitors use a geometry fallback. Identity changes fall back to the default scale. Only explicit Settings changes persist. Invalid stored data blocks display-preference writes without deleting it.

DisplayScaleProvider observes main-window movement, resize and DPI events with a 200ms debounce; monitor selection uses the physical window center solely for monitor identification. No monitor polling is used. Cleanup cancels listeners, timers and stale replies. Browser/non-native environments safely retain the default scale. Settings offers 90/100/105/110/115/125 percent and resets only the current monitor override. Do not modify Windows display settings.

Display validation (2026-10-04): frontend build, all 105 Node/frontend tests, cargo fmt --check, cargo check --locked and all 16 Rust tests passed. Seven focused tests cover separate persisted monitor preferences, identity/fallback, damaged/quota storage, debouncing/stale replies/late cleanup, live root application, logical layout constraints and palette isolation. The structural CSS matrix covers 1280x800, 1920x1080, 2560x1440 and 700x540 at 100/110/115/125 percent; it is not a rendered pixel/overflow check. Tauri dev opened ACKDeck with Responding=True and HTTP 200; verification processes were stopped. Computer Use again failed with native-pipe error 2 and browser inventory was empty. Physical two-monitor transitions, DPI appearance, visual clipping/overflow and modal/keyboard interaction remain manual checks, not verified claims. No dependency, Rust command, identifier or installer change was needed.

---

# Remaining product roadmap — temporary

## Authorized post-v1 plan — temporary

The user explicitly authorized sequential work through stages 1–9. Native GUI checks must be reported separately from automated validation.

- [x] Stage 1: Windows tray, close-to-tray preference, hidden-window work suspension
- [x] Stage 2: Official opt-in autostart and optional hidden autostart launch
- [x] Stage 3: Dated/prioritized tasks and local Windows reminders

Stage 3 uses backward-compatible optional task fields in the existing key; old tasks default to normal priority with no reminder. Tasks support editing, confirmed deletion, date groups, and a full page. A native timer queue sleeps until the next due task (clock checks at most once/minute only while pending). Task updates replace the queue, and a versioned native delivery ledger prevents duplicate dispatch across restarts. Frontend registration remains active while the window is hidden. Reminders require ACKDeck to be running; overdue unsent reminders reload at startup. The official desktop notification plugin does not provide Windows notification-click routing or synchronous proof that Windows displayed a toast; these are explicitly not claimed. Three task migration/calendar/filter tests passed, as did frontend build. Native tests are run at this milestone; installed toast interaction remains manual.
- [x] Stage 4: Local global search

Stage 4: shared localSearch covers tasks/projects/notes/files/archive using known stores only. Results carry source labels and record IDs, with graceful per-source failures. Ctrl+K opens a local dialog and Escape closes it. Related page/record navigation is wired; two cross-source/search-safety tests and TypeScript passed. No network, filesystem indexing, or search dependency was added.
- [x] Stage 5: Keyboard command palette

Stage 5: Ctrl+K dialog now combines local results with fixed navigation/create commands and dynamic registered-project commands. Up/down wrap, Enter executes, Escape closes, and the native dialog traps focus/restores it on close. New note/archive/task navigation is wired. Project commands re-resolve stored IDs and permit only Explorer/VS Code; invalid IDs/modes fail safely. Three search/palette tests and TypeScript passed. Speed Test navigation never starts measurement automatically.
- [x] Stage 6: Validated local backup/restore

Stage 6: restore temporarily locks the UI and reminder registration; a failed rollback keeps edits blocked and retains the prior-state journal for startup recovery. Six backup tests cover confirmation, snapshots, quota rollback, recovery and the transaction lock. Version-1 JSON backup includes only known local records/preferences and secret-free native preferences. Native dialogs select/save the JSON; no generic path-reading AI tool exists. Credential Manager and runtime/chat state are excluded. Unknown schemas, damaged records and key-shaped content are rejected rather than silently dropped. Restore requires an explicit card, writes a prior-state journal first, pauses reminder registration, and rolls back on native/storage failure. Startup recovers interrupted journals before mounting the app, or blocks normal operation if recovery fails. Four allowlist/confirmation/quota/crash-recovery tests, frontend build and Rust check passed. No real user data or credentials were used. A destructive clear-all feature was deliberately not added (optional in the request).
- [x] Stage 7: About and system checks

Stage 7: About shows the actual native package version, Windows and local storage approach. Explicit System Check reports credential/key boolean status, Windows network state, a disposable storage probe, backend readiness and compiled native file/project infrastructure. It never shows a secret, sends a Gemini request, or opens a file during the check. TypeScript and Rust check passed; OS toast display/actual external program availability are not implied by infrastructure readiness.
- [x] Stage 8: Extended controlled ACK AI tools/actions

Stage 8: shared local search selects only related records; today-task queries and PC/IP/last-speed/secret-free preferences are supported. Fifteen allowlisted Gemini function declarations prepare task/note/archive actions, scoped project opening, navigation and speed-test proposals. Local parsing handles tomorrow/time/reminders without a model call for direct requests. Every state/native action requires a card, validates parameters and current registered IDs, rejects stale-record changes, and reports success only after persistence/native success. Ten new AI/system tests and Rust draft-response redaction/allowlist tests passed alongside the existing integration tests. No real credential or live Gemini request was used for validation. Full live Gemini tool round-trip remains a user check.
- [x] Stage 9: UX/security source review, automated validation, runtime startup and production bundles

Stage 9: final frontend build and all 47 Node tests passed; cargo fmt --check, cargo check --locked and all 10 Rust tests passed. Release audit found no literal Gemini key, debug logging or encoding corruption. The three unreferenced React/Vite/Tauri SVG assets were removed. Ctrl+K opens instead of toggling, palette keyboard selection/combobox semantics and new-note focus were improved; restore blocks parallel edits and preserves a recovery journal if rollback fails. Tauri dev opened an ACKDeck window with Responding=True and HTTP 200. Production npm run tauri build produced MSI and NSIS successfully; scripts/verify-release.mjs verified the latest frontend asset in the EXE. The standalone EXE opened with title ACKDeck and Responding=True without a dev server. All verification processes were stopped. MSI and NSIS signatures are NotSigned; no installer was installed and no autostart entry was enabled during testing.

Manual validation remains open: Computer Use initialization succeeded but list_apps failed because its native pipe was unavailable (os error 2), and browser inventory was empty. Tray mouse/menu interactions, autostart at Windows login, installed toast display, keyboard/screen-reader/resize interaction, native backup dialogs/installed storage continuity and live Gemini tool round-trip could not be exercised through GUI automation. The implementation/automated milestones above do not claim these manual checks passed. Keep the temporary roadmap while the separate manual validation items below remain incomplete.

Stages 1–2: Rust cargo check and TypeScript passed. Tray uses the existing icon, double-click/menu restore the window, Exit uses app.exit, and close interception defaults off. Main feature components unmount while hidden/minimized. Official autostart registration changes only through an explicit Settings save; startup preferences are in the app's versioned native config file because they must be read before showing the window. Single-instance prevents duplicate tray/reminder processes. No autostart entry was enabled during validation. GUI tray/autostart interaction is not yet manually verified.

This section records planned ACKDeck work.

It is not authorization to implement the next feature automatically.

Follow the user's current request and stop when that request is complete.

## Projects

- [x] Add project entries
- [x] Edit project entries
- [x] Delete project entries
- [x] Choose a local project folder
- [x] Persist project entries
- [x] Open the selected folder through Tauri
- [x] Gracefully handle missing folders
- [x] Optionally open a project in VS Code if available

Mark **Projects** complete only after the implemented behavior has been checked.

## PC Status

- [x] Replace sample CPU data with real Windows CPU usage
- [x] Replace sample RAM data with real Windows RAM data
- [x] Replace sample disk data with real Windows disk data
- [x] Replace sample network state with real connectivity information
- [x] Add honest loading/error states
- [x] Keep monitoring lightweight

Mark **PC Status** complete only after live values have been checked.

## Quick Tools

Implement these one at a time rather than as one large feature:

- [x] Local Notes
- [x] QR creation
- [x] Local file access
- [x] IP information
- [x] Speed test

For Speed Test, choose and document the network measurement method before implementation.

Speed Test measurement method: use the official `@cloudflare/speedtest` browser engine against its default Cloudflare download/upload endpoints. Use unloaded latency/jitter and the engine's bandwidth getters (bps converted to Mbps). Start only on an explicit click with `autoStart: false`; disable packet-loss phases because they require a separately configured TURN server. Disable optional result/measurement logging and loaded-latency probes. Pause and detach callbacks on cancellation, failure, completion, or page exit. Store only the last complete, valid result locally.

Do not silently introduce a paid or tracking-based external service.

## Archive

- [x] Create a local way to organize personal files or records
- [x] Search archive entries
- [x] Open associated local files where appropriate
- [x] Preserve stored archive data

The exact Archive data model should be based on actual user needs rather than guessed in advance.

## Settings

- [x] Add local preferences only when implemented features actually require them

Implemented start page, PC refresh interval (2.5/5/10 seconds), and the existing remembered AI model in Settings. Preferences are versioned and local; credential handling is unchanged. TypeScript and local preference tests passed.

Do not create a large speculative Settings page.

The Gemini API key settings already exist and should be preserved.

## Persistence

- [x] Consolidate persistence only when the data model warrants it
- [x] Safely migrate existing stored data if storage architecture changes
- [x] Consider SQLite only if localStorage or current storage becomes insufficient

Assessment: localStorage is sufficient for this single-user catalog; no SQLite or storage migration is needed. Task access is shared for dashboard/AI use. Tasks/projects now preserve unreadable individual records and block writes on invalid root data; task legacy-key reading is retained without deleting it. Every stored feature uses a versioned key. No saved data was reset. Persistence tests passed.

## Controlled ACK AI integration

- [x] Select only relevant ACKDeck data for explicit user messages
- [x] Confirm task creation/completion and project opening before effects
- [x] Verify privacy boundaries, failure reporting, and action tests

Seven integration tests cover real local task persistence, native PC source routing, unrelated chat, approval gates, project-ID resolution, related snippets, Turkish possessive queries, public-IP opt-in, and safe failures. A Rust test verifies context allowlisting, bounds, and credential redaction using a fake test string. No real credential was inspected for validation and no live Gemini request was made.

Do not migrate storage solely for architectural neatness.

## Windows polish and release

- [ ] Keyboard accessibility check
- [ ] Screen-reader/accessibility check
- [ ] Resized-window layout check
- [x] Final ACKDeck app icon
- [x] Package metadata review
- [x] Windows packaging
- [x] Final release build
- [ ] Basic clean-machine install test if practical
- [ ] Manual global palette key/focus, native workspace/app picker launches and quick-capture cross-window flows

Polish implemented: icon-only navigation labels/tooltips, select/link focus-visible, Escape cancellation in project/archive editors, responsive file cards and AI headers, reduced-motion loading, truthful local-data copy, and removal of completed-tools fallback placeholders. Source-level labels, form submission, button types, and Turkish encoding were reviewed. Existing AD icon was retained; ICO contains 16/24/32/48/64/256 sizes. Product/package/library/identifier metadata is consistent; template author was corrected.

Manual keyboard, screen-reader, and resized-window interaction checks remain open because native automation was unavailable and the configured browser inventory was empty. Do not claim these checks passed from source inspection alone. A clean-machine installation was not attempted; installer creation is authorized, installation is not.

Final automated validation: frontend build; 25 Node tests; cargo fmt --check, cargo check --locked, and 4 Rust tests passed. Tauri dev started with an ACKDeck window, Responding=True, and HTTP 200 from its dev server. The verification app/server were stopped. Release auditing found no literal Gemini key, source debug logging, or encoding corruption; the only obsolete name is the intentionally preserved legacy task storage key.

Release 0.1.0: npm run tauri build succeeded with both NSIS and MSI bundles. scripts/verify-release.mjs confirmed that the EXE embeds the latest frontend asset. The standalone production EXE started without a dev server, showed window title ACKDeck and Responding=True, and was closed after verification. The NSIS installer signature status is NotSigned; SmartScreen may warn. Neither installer was installed. Artifacts:

- src-tauri/target/release/ack-deck.exe
- src-tauri/target/release/bundle/nsis/ACKDeck_0.1.0_x64-setup.exe
- src-tauri/target/release/bundle/msi/ACKDeck_0.1.0_x64_en-US.msi

Remaining validation limitations: no manual keyboard/screen-reader/resized-window checks, clean-machine installation, or live Gemini round-trip for the new local context. Dev/release storage continuity has not been verified through installation; no storage/profile migration or reset was performed. Keep this temporary roadmap until the remaining checks are actually performed.

When every roadmap item above is complete, delete this entire
`Remaining product roadmap — temporary`
section from `AGENTS.md`.

## Final hardening roadmap — temporary

- [x] Stage 1: ACK mark
- [x] Stage 2: Persistent AI threads
- [x] Stage 3: Bounded conversation context
- [x] Stage 4: Local routing
- [x] Stage 5: Explicit palette AI fallback
- [x] Stage 6: Tool and confirmation hardening
- [x] Stage 7: Explicit file attachments
- [x] Stage 8: Explicit image workflow
- [x] Stage 9: Configurable hotkey
- [x] Stage 10: Record undo
- [x] Stage 11: Backup compatibility
- [x] Stage 12: Privacy information
- [x] Stage 13: Navigation review
- [x] Stage 14: Brand and automated final validation

Final hardening verification (2026-10-04): npm run build, all 98 Node/frontend tests, cargo fmt --check, cargo check --locked, all 16 Rust tests and the focused release audit passed. No literal credential/debug dump was found; Windows ICO sizes are 16/24/32/48/64/256. npm run tauri dev compiled and started a process with MainWindowTitle=ACKDeck and Responding=True; the dev server returned HTTP 200. Verification processes and port 1420 were closed. No installer or release bundle was generated in this iteration.

Implementation and automated checks above are complete. Keep this temporary section until the following unavailable native/manual checks are performed; do not claim these passed. Computer Use list_apps failed with native-pipe error 2; the browser inventory was empty.

- [ ] Real WebView conversation creation, second thread, reopen/continue, local history search, rename and confirmed deletion across an actual app restart
- [ ] ACK window/tray icon rendering, physical global hotkey and live shortcut conflict/change/default restore
- [ ] Palette Escape/search, real workspace/project/shortcut launch, Quick Task/Quick Note and Recent updates
- [ ] Native attachment picker/image preview, clipboard image paste and live Gemini text/PDF/image analysis with no pre-send upload
- [ ] Native backup dialogs and complete restore of actual WebView IndexedDB/localStorage; tray interaction and resized-window/keyboard/accessibility checks

No real credential was inspected or live Gemini request made; automated tests used fake transport, isolated storage and test-only IndexedDB. There are no known failing automated tests or unfinished feature implementations; the items above are validation limitations.

## Phone Companion roadmap — temporary

- [x] Separate mobile React/TypeScript PWA and Cloudflare Worker Static Assets/API/Cron architecture
- [x] D1 migrations, indexed records/tombstones/idempotent mutation ledger, pairing/device/push/reminder/Inbox/workspace-command metadata
- [x] Allowlisted KV attachments: 10 MB, 30-day TTL, bounded capacity, no executable upload or automatic execution
- [x] Single-user owner Credential Manager/Worker secret architecture and hashed, one-time pairing/revocable phone tokens
- [x] Opt-in desktop task/note sync, conflict preservation, restore/pause guards, safe workspace mirrors and 60-second heartbeat
- [x] Mobile Today/task/note/Inbox/audio/snooze/settings, offline IndexedDB queue and cached PWA shell
- [x] Direct RFC Web Push/VAPID using @block65/webcrypto-web-push, due-reminder claims, duplicate prevention and expired subscription handling
- [x] ID-only remote workspace requests with ten-minute expiry and approval for offline-queued requests; AI Inbox only pre-fills
- [x] Turkish desktop Telefon Settings, device revocation, privacy explanation and PHONE_SETUP.md
- [x] Desktop/mobile/Worker automated validation, local D1 migrations, real sync-engine D1 round-trip and Wrangler scheduled-handler runtime test
- [x] Cloudflare login, Worker/D1/KV creation/deployment and owner/VAPID provisioning without paid-plan/billing changes
- [ ] Verify the existing Cloudflare account Free plan in the dashboard (OAuth subscription-read returned 403)
- [ ] Physical iPhone Home Screen installation, pairing, permission/test push, PC-powered-off reminder, notification tap, recording and offline reconnect checks
- [ ] Native Telefon Settings/QR, Save dialog, tray-enabled sync and trusted remote workspace launch GUI verification

Phone implementation verification (2026-10-04): desktop build and 111 Node tests, mobile build and 5 tests, Worker type check and 10 workerd/D1/KV tests, cargo fmt --check/check --locked and all 17 Rust tests passed. Both D1 migrations applied locally. The final common-Worker test uses the actual desktop/mobile sync engines for both task/note directions, completion, offline retry and tombstones. Local Wrangler served the PWA with security headers; unauthenticated access was rejected, test pairing/task sync/AI Inbox/revocation passed, and /cdn-cgi/local/scheduled?format=json returned outcome=ok. Tauri dev opened ACKDeck with Responding=True and HTTP 200. Verification processes were stopped. No installer was generated. No real Gemini/owner credential was inspected; isolated tests and ignored local .dev.vars contain only generated test values.

wrangler whoami reported not authenticated. No cloud resource, deployment or billing/paid product was created. Complete code/local checks before stopping at this interactive login boundary. Keep this roadmap until deployment and physical/native checks are actually complete. Do not claim cloud push works on a real phone until it is provisioned and tested.

Permanent phone boundaries: default off; initial upload requires explicit consent; privileged communication stays in src-tauri/src/phone.rs, using a separate phone-owner Credential Manager entry. Neither desktop frontend nor backup receives owner credentials. Only tasks/notes, minimal safe workspace metadata, Inbox, reminders/devices/commands may sync. Never sync Gemini keys/history, saved target paths, Archive or arbitrary files. mobile/src/store.ts owns the phone IndexedDB token/queue; device tokens are hashed in D1. Attachment data exists only in KV with expiry, never D1/backups; no automatic file/URL opening or Gemini send. Only saved workspace IDs can request remote launch; no shell/path/executable cloud endpoint. A restored desktop backup pauses phone sync and requires fresh consent. All phone product text stays Turkish.

Phone deployment follow-up (2026-10-04): deployed https://ack-deck-phone.ack-deck-cloud.workers.dev, D1 ack-deck-phone (d9cbc61b-c948-4ed6-9a9c-4b7c51ac5683), KV ATTACHMENTS (172ad1bcbef94b46845d75ce3281fa65), Cron * * * * *. Both production migrations applied to the newly created database; no user data was removed/uploaded. OWNER_SECRET resides in a separate Windows Credential Manager entry and Worker secret. VAPID public/private/subject secrets were safely provisioned using the authenticated account contact; no secret values were printed or written to source. Secret names/bindings/Cron and migration completion were verified. Public shell/manifest/SW returned HTTP 200 with security headers; anonymous status returned 401; native --verify confirmed authenticated status and VAPID public key without exposing owner credential. Desktop defaults to the deployed public URL; initial data upload still needs UI consent. Frontend build, six focused phone tests, release audit, cargo fmt/check and all 17 Rust tests passed. No installer generated.

No payment, R2, paid product or subscription change occurred. Account/script usage model is standard; OAuth lacks subscription-read permission (403), so it cannot independently prove the pre-existing account billing plan is Free. Do not equate standard usage_model with a paid/free plan. User dashboard plan verification remains open, alongside the existing physical iPhone/native checks.

Production iPhone Web Push fix (2026-10-04): active iPhone 11 had an Apple endpoint and valid-length 87/22 p256dh/auth keys; device was not revoked. A safe owner-only test-device endpoint and native --test-push diagnostic exercised the actual saved subscription without exposing any credential or key. Sanitized wrangler tail captured the exact transport TypeError: Workers fetch rejects redirect:error and supports only follow/manual. VAPID verification inside the deployed Worker signs/verifies against the deployed public key and found the pair valid. Changed to redirect:manual with explicit 3xx rejection, preserving SSRF/credential protections. Added safe Turkish error codes; test sends deactivate subscriptions only after provider 404/410, never 403/network/crypto errors. Native diagnostics, not frontend, use the owner Credential Manager entry. No keys rotated, pairing revoked or Tasks/Notes/Inbox changed.

Corrected Worker/mobile deployed version dd709dd5-6e90-4a15-bdad-9ac0cfc1a41b. Live saved-iPhone push test returned HTTP 200 PUSH_ACCEPTED (provider response successful); this proves server acceptance, not physical notification display. Twelve Worker tests passed, including real workerd encryption/POST against a controlled outbound service, redirect/auth/gone handling, and VAPID mismatch rejection. Eight mobile tests passed, including Home Screen/permission/subscription gates, base64url applicationServerKey decoding, push display and click routing. Mobile build, Worker type check, release audit, Rust fmt/check passed. No private secret printed/committed, billing change, provider dependency or installer. Physical iPhone receipt remains open; current phone should not need re-subscription.

## Stable release 1.0.0 — feature freeze (2026-10-04)

Product/package versions are consistently 1.0.0; product ACKDeck, visual mark ACK and identifier com.alican.ackdeck remain unchanged. No feature, storage key, migration, credential or cloud resource was replaced. The previous MSI UpgradeCode ac8c228a-564c-5567-b871-ace57ac64afc and publisher alican are explicitly preserved. Installer languages are Turkish. Generated NSIS code preserves app data during UpdateMode; upgrade installation/profile continuity has not been physically tested.

Final validation passed: desktop production build and all 111 frontend tests (including backup/restore); mobile production build and all 8 tests; Worker type check and all 12 tests; cargo fmt --check, cargo check --locked and all 17 Rust tests. Release audit reported zero failures; the 11 public frontend text assets contained no literal Gemini key/private-key block or development-server dependency. Credential values were not inspected. This folder has no Git repository, so committed-history status cannot be verified. Ignored local test/secret files remain excluded from public assets.

npm run tauri build generated both 1.0.0 bundles successfully. verify-release.mjs confirmed the EXE embeds current index-CEnFNAUl.js. Windows EXE metadata is ACKDeck/alican/1.0.0. The standalone release started without a development server, showed ACKDeck and Responding=True, and the verification process was stopped. EXE, NSIS and MSI signatures are NotSigned. Neither installer was installed; physical GUI/accessibility/clean-machine/upgrade checks above are not claimed as automated successes.

- src-tauri/target/release/bundle/nsis/ACKDeck_1.0.0_x64-setup.exe
- src-tauri/target/release/bundle/msi/ACKDeck_1.0.0_x64_tr-TR.msi

Cloudflare production was not redeployed or reconfigured, and no credential/VAPID rotation occurred. Read-only production checks returned HTTP 200 for the mobile shell, manifest and service worker, and HTTP 401 for anonymous /api/status. The user reports the phone functionality complete; no new physical iPhone test was performed during this release. Existing manual-validation items stay open rather than being inferred from build success. Feature development is frozen; only confirmed bugs justify further changes.
