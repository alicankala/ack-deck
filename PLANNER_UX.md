# Planner and product UX refresh — 2026-10-09

User requested a general desktop/mobile cleanup and recurring study programs. The user reviewed the finished summary and explicitly approved commit, push, deployment, installers and GitHub release on 2026-10-09. Release version: 1.3.0.

## Product changes

- Weekly plan presents a task/payment and its reminder in one card. A reminder whose target falls outside the displayed week remains visible separately. The scheduling engine and notification delivery are unchanged.
- Desktop uses a responsive week grid. Mobile uses a compact day selector and readable selected-day cards, with previous/current/next week navigation.
- Study programs have a name, start/end dates, multiple subjects, selected weekdays, start time, duration and optional topic. Programs can be paused, resumed, edited and deleted. Blocks repeat within the configured date range without generating individual task records. Overlapping blocks are marked. Study blocks do not generate notifications.
- Mobile Today has a clear daily focus, quieter statistics, project next steps and compact capture controls. Task/subscription/inbox actions use the shared action menu. Checklist rows use one action menu for reorder/remove. Desktop project, checklist, template and weekly review layouts have consistent spacing and hierarchy.

## Data and compatibility

Study programs use a separate validated local store and are included in optional full backup/restore. Older backups preserve this store. Invalid storage and quota errors retain existing data and show errors.

Phone sync schema 4 supports versioned study-program records, offline edits, conflict handling and tombstones. Schema upgrades reset the pull cursor while preserving the queued edits and baseline. Older schema clients do not receive unsupported study-program records. Migration `0005_study_programs.sql` adds a separate table; it passed isolated tests and was applied to production after release approval. Existing pairing, notification delivery and stored task/note/project records are preserved.

## Validation

- Desktop production frontend build and 184 tests passed.
- Mobile production build and 19 tests passed.
- Cloud type check and 16 isolated Worker tests passed, including real desktop/mobile sync engines against local D1.
- Rust `cargo check --locked` and 23 tests passed. Repository-wide formatting has pre-existing differences, including `phone.rs`; it is not claimed as passing.
- Release source audit: zero failures. Git whitespace check passed.
- 26 browser layout checks on actual production frontend builds passed, covering desktop 700–1920px and 100/125% scale, mobile 320–680px, and program dialogs. Program creation/save/reload, reminder deduplication and checklist menu operations were exercised with isolated synthetic data.

Visual previews are stored in the calling chat's `outputs` directory. Browser checks do not prove native Windows notification delivery, physical iPhone behavior, or installer upgrade behavior. Those require device/runtime checks after approval.

## Approved release

Prepare ACKDeck's release versions, apply the additive production migration before deploying schema-4 clients, deploy the matching cloud/mobile assets, build and verify Windows installers, and commit/push/publish the release. Preserve the existing app identifier, installer upgrade identity, data, cloud resources and pairing.

Release artifacts: ACKDeck_1.3.0_x64-setup.exe and ACKDeck_1.3.0_x64_tr-TR.msi were built with the existing updater key; both updater signatures were generated. The release EXE embeds index-BrMX1NIA.js and reports product/file version 1.3.0. Authenticode certificate signing is not configured. The live mobile shell, manifest and service worker returned 200; anonymous /api/status returned 401. No physical installation or phone receipt test is claimed.
