// MediaRecorder WebM sometimes has no duration header. A metadata-only seek
// lets the browser determine duration without starting playback.
type AudioDuration = { duration: number; currentTime: number };
const probing = new WeakSet<AudioDuration>();
export function prepareAudioDuration(audio: AudioDuration) {
  if (Number.isFinite(audio.duration)) return;
  probing.add(audio);
  try { audio.currentTime = 1e10; } catch { probing.delete(audio); }
}
export function restoreAudioStart(audio: AudioDuration) {
  if (probing.has(audio) && Number.isFinite(audio.duration)) {
    probing.delete(audio);
    audio.currentTime = 0;
  }
}
