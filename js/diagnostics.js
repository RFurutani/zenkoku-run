// 診断画面。友達（特にiPhone利用者）から「動かない」と言われたときに、開発者が
// 遠隔で原因を切り分けられるよう、版数・通信状態・認証状態を一覧表示してスクリーンショットで
// 送ってもらうための画面（docs/progress.md「次の方針」参照）。
// ログインできないこと自体が問題になるケースを想定するため、login-screen／main-screenの
// どちらの状態でも開けるよう、ボタンはその外側（footer付近）に置く。
// トークン・メールアドレスなど秘密情報はスクリーンショットが第三者に渡る可能性があるため表示しない。
import { fetchHealth, fetchMe } from "./api.js";
import { loadIdToken, isExpired, getRemainingSeconds } from "./token-store.js";
import { APP_VERSION } from "./version.js";

const diagnosticsButton = document.getElementById("diagnosticsButton");
const diagnosticsPanel = document.getElementById("diagnosticsPanel");
const diagnosticsScrim = document.getElementById("diagnosticsScrim");
const diagnosticsList = document.getElementById("diagnosticsList");
const diagnosticsCloseButton = document.getElementById("diagnosticsCloseButton");

let lastFocusedEl = null;

// CLAUDE.mdセキュリティ規約8：利用者入力・サーバー由来の文字列をinnerHTMLで描画しない。
// ここではtextContentのみで組み立てる。
function addRow(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  diagnosticsList.append(dt, dd);
}

async function runDiagnostics() {
  diagnosticsList.textContent = "";

  addRow("診断実行時刻", new Date().toLocaleString("ja-JP"));
  addRow("アプリ版数", `v${APP_VERSION}`);
  addRow("User Agent", navigator.userAgent);
  addRow("画面サイズ", `${window.innerWidth} × ${window.innerHeight}`);

  const idToken = loadIdToken();
  if (!idToken) {
    addRow("ログイン状態", "未ログイン（トークンなし）");
  } else if (isExpired(idToken)) {
    addRow("ログイン状態", "ログイン済み（期限切れ）");
  } else {
    addRow("ログイン状態", "ログイン済み");
    const remaining = getRemainingSeconds(idToken);
    addRow("トークン残り時間", remaining === null ? "不明" : `約${Math.floor(remaining / 60)}分`);
  }

  const healthStart = performance.now();
  try {
    const res = await fetchHealth();
    const elapsed = Math.round(performance.now() - healthStart);
    if (res.ok) {
      const data = await res.json();
      addRow("API疎通", `OK（${elapsed}ms、KV: ${data.kv === "ok" ? "OK" : "NG"}）`);
    } else {
      addRow("API疎通", `異常（HTTP ${res.status}、${elapsed}ms）`);
    }
  } catch {
    addRow("API疎通", "接続できませんでした");
  }

  // 認証結果は「トークンが有効そうに見える場合」だけ問い合わせる。
  // トークンが無い状態で送ると常に401になり「ログイン無効」と誤解を招くため、
  // その場合は問い合わせ自体をせず理由を明示する。
  if (idToken && !isExpired(idToken)) {
    try {
      const res = await fetchMe();
      if (res.status === 200) {
        addRow("認証結果", "200（ログイン正常）");
      } else if (res.status === 401) {
        addRow("認証結果", "401（ログイン無効・要再ログイン）");
      } else if (res.status === 403) {
        addRow("認証結果", "403（このアカウントは利用許可されていません）");
      } else {
        addRow("認証結果", `HTTP ${res.status}`);
      }
    } catch {
      addRow("認証結果", "接続できませんでした");
    }
  } else {
    addRow("認証結果", "未確認（未ログインのため）");
  }
}

function openDiagnostics() {
  lastFocusedEl = document.activeElement;
  diagnosticsPanel.removeAttribute("aria-hidden");
  diagnosticsPanel.classList.add("open");
  diagnosticsScrim.classList.add("open");
  diagnosticsCloseButton.focus();
}

function closeDiagnostics() {
  diagnosticsPanel.classList.remove("open");
  diagnosticsScrim.classList.remove("open");
  diagnosticsPanel.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }
}

diagnosticsButton?.addEventListener("click", async () => {
  openDiagnostics();
  await runDiagnostics();
});
diagnosticsCloseButton?.addEventListener("click", closeDiagnostics);
diagnosticsScrim?.addEventListener("click", closeDiagnostics);
