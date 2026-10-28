import { validNote, type PhoneNote } from "./phone";

type LineEdit = {
  bStart: number;
  bEnd: number;
  replacement: string[];
};

function toLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  return normalized === "" ? [] : normalized.split("\n");
}

function linesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function computeLineEdits(base: string[], target: string[]): LineEdit[] | null {
  const n = base.length;
  const m = target.length;
  // Guard against quadratic blowup on huge 5000+ line notes
  if (n * m > 4_000_000) return null;

  const dp = new Uint16Array((n + 1) * (m + 1));
  const width = m + 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (base[i] === target[j]) {
        dp[i * width + j] = dp[(i + 1) * width + (j + 1)] + 1;
      } else {
        const down = dp[(i + 1) * width + j];
        const right = dp[i * width + (j + 1)];
        dp[i * width + j] = down >= right ? down : right;
      }
    }
  }

  const anchors: [number, number][] = [[-1, -1]];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === target[j]) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  anchors.push([n, m]);

  const edits: LineEdit[] = [];
  for (let k = 0; k < anchors.length - 1; k++) {
    const [bPrev, tPrev] = anchors[k];
    const [bCurr, tCurr] = anchors[k + 1];
    const bStart = bPrev + 1;
    const bEnd = bCurr;
    const tStart = tPrev + 1;
    const tEnd = tCurr;
    if (bStart < bEnd || tStart < tEnd) {
      const replacement = target.slice(tStart, tEnd);
      const baseSlice = base.slice(bStart, bEnd);
      if (!linesEqual(baseSlice, replacement)) {
        edits.push({ bStart, bEnd, replacement });
      }
    }
  }
  return edits;
}

function editsConflict(a: LineEdit, b: LineEdit): boolean {
  const aPureInsert = a.bStart === a.bEnd;
  const bPureInsert = b.bStart === b.bEnd;
  if (aPureInsert && bPureInsert) {
    return a.bStart === b.bStart;
  }
  if (aPureInsert) {
    return a.bStart > b.bStart && a.bStart < b.bEnd;
  }
  if (bPureInsert) {
    return b.bStart > a.bStart && b.bStart < a.bEnd;
  }
  // Both modify/delete non-empty base ranges [bStart, bEnd)
  return a.bStart < b.bEnd && b.bStart < a.bEnd;
}

export function mergeText3Way(
  baseText: string,
  localText: string,
  remoteText: string,
): { merged: string; conflict: boolean } {
  const normBase = baseText.replace(/\r\n/g, "\n");
  const normLocal = localText.replace(/\r\n/g, "\n");
  const normRemote = remoteText.replace(/\r\n/g, "\n");

  if (normLocal === normRemote) return { merged: normLocal, conflict: false };
  if (normLocal === normBase) return { merged: normRemote, conflict: false };
  if (normRemote === normBase) return { merged: normLocal, conflict: false };

  const baseLines = toLines(normBase);
  const localLines = toLines(normLocal);
  const remoteLines = toLines(normRemote);

  const editsL = computeLineEdits(baseLines, localLines);
  const editsR = computeLineEdits(baseLines, remoteLines);
  if (!editsL || !editsR) return { merged: normLocal, conflict: true };

  const out: string[] = [];
  let pos = 0;
  let il = 0;
  let ir = 0;

  while (il < editsL.length || ir < editsR.length) {
    const el = il < editsL.length ? editsL[il] : null;
    const er = ir < editsR.length ? editsR[ir] : null;

    if (el && er && editsConflict(el, er)) {
      if (el.bStart === er.bStart && el.bEnd === er.bEnd && linesEqual(el.replacement, er.replacement)) {
        while (pos < el.bStart) out.push(baseLines[pos++]);
        out.push(...el.replacement);
        pos = el.bEnd;
        il++;
        ir++;
        continue;
      }
      return { merged: normLocal, conflict: true };
    }

    const pickLocal =
      el !== null &&
      (er === null ||
        el.bStart < er.bStart ||
        (el.bStart === er.bStart && el.bStart === el.bEnd && er.bStart < er.bEnd));

    const chosen = (pickLocal ? el : er)!;
    while (pos < chosen.bStart) out.push(baseLines[pos++]);
    out.push(...chosen.replacement);
    pos = chosen.bEnd;
    if (pickLocal) il++;
    else ir++;
  }

  while (pos < baseLines.length) out.push(baseLines[pos++]);
  return { merged: out.join("\n"), conflict: false };
}

export function tryMergeNoteRecords(
  base: PhoneNote,
  local: PhoneNote,
  server: PhoneNote,
): PhoneNote | null {
  if (!base || !local || !server) return null;

  // 3-way title merge
  let mergedTitle: string;
  if (local.title === server.title) mergedTitle = local.title;
  else if (local.title === base.title) mergedTitle = server.title;
  else if (server.title === base.title) mergedTitle = local.title;
  else return null;

  // 3-way line-based content merge
  const contentMerge = mergeText3Way(base.content ?? "", local.content ?? "", server.content ?? "");
  if (contentMerge.conflict || contentMerge.merged.length > 30000) return null;

  // 3-way metadata merge
  const pickMeta = <K extends "projectId" | "workspaceId" | "sourceInboxId">(key: K) => {
    const l = local[key];
    const s = server[key];
    const b = base[key];
    if (l === s) return l;
    if (l === b) return s;
    if (s === b) return l;
    return l ?? s;
  };

  const mergedAttachments =
    local.attachments || server.attachments
      ? [
          ...(server.attachments ?? []),
          ...(local.attachments ?? []).filter((a) => !(server.attachments ?? []).some((b) => b.id === a.id)),
        ].slice(0, 20)
      : undefined;

  const projectId = pickMeta("projectId");
  const workspaceId = pickMeta("workspaceId");
  const sourceInboxId = pickMeta("sourceInboxId");

  const candidate: PhoneNote = {
    title: mergedTitle,
    content: contentMerge.merged,
    updatedAt: Math.max(local.updatedAt || 0, server.updatedAt || 0, Date.now()),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(sourceInboxId !== undefined ? { sourceInboxId } : {}),
    ...(mergedAttachments !== undefined ? { attachments: mergedAttachments } : {}),
  };

  return validNote(candidate) ? candidate : null;
}
