import { fetchConfig, fetchMe } from "./api.js";
import { saveIdToken, loadIdToken, clearIdToken, isExpired } from "./token-store.js";
import { renderSummary } from "./summary.js";
import { APP_VERSION } from "./version.js";
import "./diagnostics.js";

// ログイン前後どちらの画面でも見える必要があるため、init()の成否を問わず
// ここで即座に描画する（CLAUDE.mdセキュリティ規約8：textContentのみ使用）。
const appFooter = document.getElementById("app-footer");
if (appFooter) {
  appFooter.textContent = `v${APP_VERSION}`;
}

const loginScreen = document.getElementById("login-screen");
const mainScreen = document.getElementById("main-screen");
const loginMessage = document.getElementById("login-message");
const userEmailEl = document.getElementById("user-email");
const logoutButton = document.getElementById("logout-button");

// CLAUDE.mdセキュリティ規約8：利用者入力・サーバー由来の文字列はinnerHTMLで描画しない。
// ここではtextContentのみを使う。
function showLogin(message) {
  loginScreen.hidden = false;
  mainScreen.hidden = true;
  loginMessage.textContent = message;
}

function showMain(email) {
  loginScreen.hidden = true;
  mainScreen.hidden = false;
  userEmailEl.textContent = email;
}

async function handleCredentialResponse(response) {
  saveIdToken(response.credential);
  await checkLoginState();
}

async function checkLoginState() {
  const idToken = loadIdToken();
  if (!idToken || isExpired(idToken)) {
    clearIdToken();
    showLogin("");
    return;
  }

  let res;
  try {
    res = await fetchMe();
  } catch {
    showLogin("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
    return;
  }

  if (res.status === 200) {
    const { email } = await res.json();
    showMain(email);
    await renderSummary();
    return;
  }

  if (res.status === 401) {
    // トークンが無効・期限切れ＝再ログインで解決する（design.md 2.2節）。
    clearIdToken();
    showLogin("ログインが必要です。もう一度ログインしてください。");
    return;
  }

  if (res.status === 403) {
    // 許可リスト外＝再ログインしても解決しないため、その旨を明記する（design.md 2.2節）。
    showLogin(
      "このGoogleアカウントはこのアプリの利用を許可されていません。開発者に連絡してください。"
    );
    return;
  }

  showLogin("予期しないエラーが発生しました。しばらくしてからもう一度お試しください。");
}

// GSIスクリプトは<script async>で読み込んでおり、type="module"のauth.jsとは
// 読み込み完了の順序が保証されない（T-15.5で発覚：google未定義エラー）。
// setTimeoutでの「待てば大体間に合う」対応はせず、スクリプトのloadイベントで
// 確実に読み込み完了を検知してから初期化する。
function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.getElementById("gsi-client-script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Googleログイン用スクリプトの読み込みに失敗しました")),
      { once: true }
    );
  });
}

async function init() {
  let googleClientId;
  try {
    ({ googleClientId } = await fetchConfig());
  } catch {
    showLogin("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
    return;
  }

  try {
    await waitForGoogleIdentity();
  } catch {
    showLogin(
      "Googleログインの読み込みに失敗しました。通信環境を確認し、再読み込みしてください。"
    );
    return;
  }

  google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleCredentialResponse,
  });
  google.accounts.id.renderButton(document.getElementById("google-signin-button"), {
    theme: "outline",
    size: "large",
  });

  logoutButton.addEventListener("click", () => {
    clearIdToken();
    showLogin("");
  });

  await checkLoginState();
}

init();
