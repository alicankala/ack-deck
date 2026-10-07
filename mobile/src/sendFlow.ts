/** One id per draft, including retries after a response was lost. */
export function createAttachmentSender(send: (blob: Blob, name: string, id: string) => Promise<void>) {
  const ids = new WeakMap<Blob, string>(), sent = new WeakSet<Blob>();
  let pending = false;
  return async (blob: Blob, name: string): Promise<boolean> => {
    if (pending) return false;
    if (sent.has(blob)) return true;
    pending = true;
    let id = ids.get(blob);
    if (!id) { id = crypto.randomUUID(); ids.set(blob, id); }
    try { await send(blob, name, id); sent.add(blob); return true; }
    finally { pending = false; }
  };
}
