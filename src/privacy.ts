export const redactSecrets = (text: string) => text.replace(/AIza[\w-]{20,}/g, "[gizli anahtar]");
