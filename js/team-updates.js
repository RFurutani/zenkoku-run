// チームの新着通知（T-50）。ログイン直後、通知が1件以上あるときだけ自動で開く
// モーダル（既存の.sheet/.scrim、診断・設定・規約と同じパターンを流用）。
// モードに関係なく出す（開くと個人モードから始まるが、通知はそれとは独立に出す。design.md仕様⑦）。
// CLAUDE.mdセキュリティ規約8：nickname・市名・県名はtextContentのみで組み立てる。

import { fetchTeamUpdates, markTeamUpdatesSeen } from "./api.js";

const panel = document.getElementById("teamUpdatesPanel");
const scrim = document.getElementById("teamUpdatesScrim");
const closeButton = document.getElementById("teamUpdatesCloseButton");
const listEl = document.getElementById("teamUpdatesList");
const errorEl = document.getElementById("teamUpdatesError");

let lastFocusedEl = null;
// 開いている間だけ値を持つ。閉じたときにPATCH /seenを呼ぶ対象チーム
// （取得に失敗して開いた場合はnullのままにし、既読化を呼ばせない。実際には
// 何も見せられていないため「見た」ことにしてはならない）。
let openTeamId = null;

function renderUpdateLine(update) {
  const li = document.createElement("li");
  let text = `🏅 ${update.nickname} が ${update.cityName}`;
  if (update.otherCount > 0) {
    text += ` ほか${update.otherCount}市`;
  }
  text += " を制覇しました";
  li.textContent = text;
  return li;
}

function openPanel() {
  lastFocusedEl = document.activeElement;
  panel.removeAttribute("aria-hidden");
  panel.classList.add("open");
  scrim.classList.add("open");
  closeButton.focus();
}

async function closePanel() {
  panel.classList.remove("open");
  scrim.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }

  // 閉じたときにlast_seen_atを更新する（design.md仕様⑤：開いた瞬間だと、
  // 読む前に閉じた場合に二度と見られなくなるため）。
  const teamId = openTeamId;
  openTeamId = null;
  if (teamId === null) {
    return;
  }
  try {
    const res = await markTeamUpdatesSeen(teamId);
    if (!res.ok) {
      // 既読化の失敗は利用者の操作を妨げるほどではないため、モーダルは開かず
      // コンソールにだけ残す（次回ログイン時にもう一度同じ通知が出るだけで、
      // 実害は「同じ通知をもう一度見る」にとどまるため）。
      console.error("通知の既読化に失敗しました", res.status);
    }
  } catch (err) {
    console.error("通知の既読化に失敗しました", err);
  }
}

function showFetchError() {
  openTeamId = null;
  listEl.textContent = "";
  errorEl.textContent =
    "チームの新着を取得できませんでした。しばらくしてからもう一度お試しください。";
  openPanel();
}

// ログイン直後、GET /api/meのteamsをもとにauth.jsから呼ぶ。
// チームに所属していない利用者（teamsが空）では、通知取得自体を呼ばない。
export async function checkTeamUpdates(meData) {
  const teams = meData?.teams ?? [];
  if (teams.length === 0) {
    return;
  }

  // 掛け持ち（複数チーム所属）は現状の運用では発生しない前提（design.md 4.10.15節と
  // 同じ判断）。所属の先頭チームだけを対象にする。
  const teamId = teams[0].id;

  let res;
  try {
    res = await fetchTeamUpdates(teamId);
  } catch (err) {
    console.error("チームの新着通知を取得できませんでした", err);
    showFetchError();
    return;
  }

  if (!res.ok) {
    console.error("チームの新着通知を取得できませんでした", res.status);
    showFetchError();
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error("チームの新着通知の解析に失敗しました", err);
    showFetchError();
    return;
  }

  const updates = data.updates ?? [];
  if (updates.length === 0) {
    return;
  }

  errorEl.textContent = "";
  listEl.textContent = "";
  updates.forEach((update) => listEl.appendChild(renderUpdateLine(update)));
  openTeamId = teamId;
  openPanel();
}

closeButton?.addEventListener("click", closePanel);
scrim?.addEventListener("click", closePanel);
