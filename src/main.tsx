import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DisplayScaleProvider } from "./DisplayScale";
import { recoverPendingRestore } from "./backupStore";
import { PaletteWindow } from "./components/PaletteWindow";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const paletteWindow = (window as Window & { __ACK_PALETTE__?: boolean }).__ACK_PALETTE__ === true;
if (paletteWindow) root.render(<React.StrictMode><PaletteWindow /></React.StrictMode>);
else void recoverPendingRestore().then(() => root.render(<React.StrictMode><DisplayScaleProvider><App /></DisplayScaleProvider></React.StrictMode>)).catch(() => root.render(<main style={{ padding: 32, color: "#edf3f9", background: "#101317" }}><h1>ACKDeck verileri korunuyor</h1><p>Yarım kalan geri yükleme kurtarılamadı veya yerel depolamaya erişilemiyor. Normal kullanım güvenli şekilde durduruldu. Kurtarma kaydı silinmedi; uygulamayı yeniden açın.</p></main>));
