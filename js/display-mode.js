// 個人／チームの表示モード切替（T-36 M3、design.md 4.10節・画面仕様①⑤⑦⑧）。
// このモジュールが「今どちらを見ているか」の唯一の状態を持つ。summary.js・pref-sheet.jsは
// getDisplayMode()を都度呼んで参照するだけで、状態そのものは持たない。
// CLAUDE.mdセキュリティ規約8：チーム名（サーバー由来の文字列）はtextContentで組み立てる。

import { renderSummary } from "./summary.js";
import { isPrefSheetOpen, closePrefSheet } from "./pref-sheet.js";

const tabsEl = document.getElementById("modeTabs");

let currentMode = "personal";
let currentTeamId = null;

// メンバーが1人だけのチームはタブに出さない（画面仕様⑧）。
// 複数チーム所属時も、M3では1チーム分のUIしか作らない（design.md 4.10.15節）ため
// 先頭の1件だけを使う。
let eligibleTeams = [];

export function getDisplayMode() {
  return { mode: currentMode, teamId: currentTeamId };
}

function makeTabButton(label, isActive, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tab" + (isActive ? " active" : "");
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", isActive ? "true" : "false");
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

// focusActiveは「利用者の操作でタブが切り替わった直後」だけtrueにする。
// 初回描画（ログイン直後）でtrueにすると、何も操作していないのに
// フォーカスが移動してしまうため区別する。
function renderTabs(focusActive) {
  tabsEl.textContent = "";
  if (eligibleTeams.length === 0) {
    tabsEl.hidden = true;
    return;
  }
  tabsEl.hidden = false;

  const team = eligibleTeams[0];
  const personalTab = makeTabButton("個人", currentMode === "personal", () => switchMode("personal", null));
  const teamTab = makeTabButton(
    `${team.name}（${team.memberCount}人）`,
    currentMode === "team",
    () => switchMode("team", team.id)
  );

  tabsEl.appendChild(personalTab);
  tabsEl.appendChild(teamTab);

  if (focusActive) {
    (currentMode === "personal" ? personalTab : teamTab).focus();
  }
}

async function switchMode(mode, teamId) {
  if (currentMode === mode && currentTeamId === teamId) {
    return;
  }
  currentMode = mode;
  currentTeamId = teamId;

  // 開いたままの県詳細シートは古いモードのデータを表示しているため閉じる。
  // 閉じていない状態でclosePrefSheet()を呼ぶと、前回開いたときのトリガー要素へ
  // 不要にフォーカスが飛んでしまうため、開いている場合だけ呼ぶ。
  if (isPrefSheetOpen()) {
    closePrefSheet();
  }

  renderTabs(true);
  await renderSummary();
}

// auth.jsのcheckLoginState()から、GET /api/me成功時に毎回呼ぶ。
// モードの記憶はしない方針（画面仕様⑤）のため、呼ばれるたびに必ず「個人」へ戻す。
export function initDisplayMode(meData) {
  currentMode = "personal";
  currentTeamId = null;
  eligibleTeams = (meData.teams || []).filter((team) => team.memberCount >= 2);
  renderTabs(false);
}
