export async function withAiTimeout<T>(operation: Promise<T>, milliseconds = 30000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("İşlem sonucu zamanında doğrulanamadı. Yeniden denemeden önce ilgili kaydı veya pencereyi kontrol edin.")), milliseconds); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
