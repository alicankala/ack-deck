// Conservative recognizers: ordinary Turkish prose and dates are unchanged.
const credentialPatterns = () => [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|$)/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}=*/gi,
  /\bAIza[\w-]{20,}/g,
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|owner[_-]?secret|password)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{8,}["']?/gi
];
export function hasCredentials(text:string):boolean { return credentialPatterns().some(pattern=>pattern.test(text)); }
export function redactSecrets(text:string):string { for(const pattern of credentialPatterns())text=text.replace(pattern,"[gizli anahtar]");return text; }
export function scrubPrivateText(text:string):string {
  return redactSecrets(text).replace(/(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])[^\r\n<>"'|;,]*/g,"[yerel konum]");
}
export function scrubSync<T>(value:T):T {
  if(typeof value==="string")return scrubPrivateText(value) as T;
  if(Array.isArray(value))return value.map(item=>scrubSync(item)) as T;
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,scrubSync(item)])) as T;
  return value;
}
export function safeAiContext(value:unknown):unknown {
  if(typeof value==="string")return scrubPrivateText(value).replace(/(?:^|\s)\/(?:Users|home|tmp|var|mnt)\/[^\r\n<>"'|;,]*/g," [yerel konum]");
  if(Array.isArray(value))return value.map(safeAiContext);
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([key])=>!/(?:path|target|directory|location)$/i.test(key)).map(([key,item])=>[key,safeAiContext(item)]));
  return value;
}
