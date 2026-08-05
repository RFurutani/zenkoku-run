import { fetchConfig, fetchMe } from "./api.js";
import { saveIdToken, loadIdToken, clearIdToken, isExpired } from "./token-store.js";

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

async function init() {
  let googleClientId;
  try {
    ({ googleClientId } = await fetchConfig());
  } catch {
    showLogin("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
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
