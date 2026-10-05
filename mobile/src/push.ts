import { api, json, type MobileState } from "./store";
export async function enablePush(state: MobileState) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & {standalone?:boolean}).standalone;
  if (ios && !installed) throw new Error("Bildirim almak için ACKDeck Mobile'ı Safari paylaşım menüsünden Ana Ekranınıza ekleyin ve oradan açın.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Bu tarayıcı Web Push bildirimlerini desteklemiyor.");
  // Permission is requested immediately inside the user's click handler, before network awaits.
  if(Notification.permission==="denied")throw new Error("Bildirim izni verilmedi. İzni cihaz ayarlarından değiştirebilirsiniz.");
  const permission = Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Bildirim izni verilmedi. İzni cihaz ayarlarından değiştirebilirsiniz.");
  const status = await api<{vapidPublicKey:string}>(state,"status");
  if (!status.vapidPublicKey) throw new Error("Bildirim sunucusu henüz ayarlanmamış.");
  try {
  const base64=status.vapidPublicKey.replaceAll("-","+").replaceAll("_","/");
  const raw = atob(base64+"=".repeat((4-base64.length%4)%4));
  const key = Uint8Array.from(raw,char => char.charCodeAt(0));
  if(key.length!==65||key[0]!==4)throw new Error("Bildirim sunucusu anahtarı geçersiz.");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await api(state,"push",json(subscription.toJSON()));
  } catch { throw new Error("Bildirim aboneliği oluşturulamadı. İzni ve bağlantıyı kontrol edip tekrar deneyin."); }
}
