// 設定画面（T-53）。ニックネームの表示・変更のみを扱う。ログイン中のみ開ける
// （settingsButtonは#main-screenの内側にあるため、hiddenの制御はauth.jsに任せる）。
// CLAUDE.mdセキュリティ規約8：サーバー由来の文字列はinnerHTMLで描画せず、textContentのみ使う。

import { fetchMe, updateNickname } from "./api.js";

const settingsButton = document.getElementById("settingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const settingsScrim = document.getElementById("settingsScrim");
const settingsCloseButton = document.getElementById("settingsCloseButton");
const nicknameCurrentEl = document.getElementById("nicknameCurrent");
const nicknameFormEl = document.getElementById("nicknameForm");
const fNicknameEl = document.getElementById("fNickname");
const nicknameErrorEl = document.getElementById("nicknameError");
const nicknameSuccessEl = document.getElementById("nicknameSuccess");
const nicknameSubmitButton = document.getElementById("nicknameSubmitButton");

let lastFocusedEl = null;
let submitInFlight = false;

function showNicknameError(message) {
  nicknameErrorEl.textContent = message;
}

function showNicknameSuccess(message) {
  nicknameSuccessEl.textContent = message;
}

// nicknameがnull（未設定）の場合、display_name（本名）へはフォールバックしない
// （T-53、開発者指示）。「名前未設定」の固定表示にとどめ、設定を促す文面を添える。
function renderCurrentNickname(nickname) {
  if (nickname) {
    nicknameCurrentEl.textContent = `現在のニックネーム：${nickname}`;
  } else {
    nicknameCurrentEl.textContent =
      "現在のニックネーム：未設定（走行記録には「名前未設定」と表示されます。下の欄から設定してください）";
  }
}

async function loadCurrentNickname() {
  nicknameCurrentEl.textContent = "読み込み中…";
  try {
    const res = await fetchMe();
    if (!res.ok) {
      nicknameCurrentEl.textContent = "";
      showNicknameError("現在のニックネームを取得できませんでした。開き直してください。");
      return;
    }
    const data = await res.json();
    renderCurrentNickname(data.nickname);
    fNicknameEl.value = data.nickname || "";
  } catch {
    nicknameCurrentEl.textContent = "";
    showNicknameError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
  }
}

export function openSettings() {
  lastFocusedEl = document.activeElement;
  showNicknameError("");
  showNicknameSuccess("");

  settingsPanel.removeAttribute("aria-hidden");
  settingsPanel.classList.add("open");
  settingsScrim.classList.add("open");
  settingsCloseButton.focus();

  loadCurrentNickname();
}

function closeSettings() {
  settingsPanel.classList.remove("open");
  settingsScrim.classList.remove("open");
  settingsPanel.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }
}

async function handleNicknameSubmit(event) {
  event.preventDefault();
  if (submitInFlight) {
    return;
  }

  showNicknameError("");
  showNicknameSuccess("");
  submitInFlight = true;
  nicknameSubmitButton.disabled = true;

  try {
    const res = await updateNickname(fNicknameEl.value);

    if (res.status === 401) {
      showNicknameError("セッションが切れました。再ログインしてください。");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      showNicknameError(body?.error ?? "保存に失敗しました。しばらくしてからもう一度お試しください。");
      return;
    }

    const data = await res.json();
    renderCurrentNickname(data.nickname);
    fNicknameEl.value = data.nickname || "";
    showNicknameSuccess("保存しました。");
  } catch {
    showNicknameError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
  } finally {
    submitInFlight = false;
    nicknameSubmitButton.disabled = false;
  }
}

settingsButton?.addEventListener("click", openSettings);
settingsCloseButton?.addEventListener("click", closeSettings);
settingsScrim?.addEventListener("click", closeSettings);
nicknameFormEl?.addEventListener("submit", handleNicknameSubmit);
