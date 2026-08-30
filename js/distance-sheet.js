// 走行距離の可視化シート（T-49 M4、design.md 4.11節）。数値サマリーの「走行」の行
// （既存の.sheet/.scrimを流用、診断・設定・規約・チーム通知に続く）をタップすると開く。
// CLAUDE.mdセキュリティ規約8：ニックネーム等サーバー由来の文字列はtextContentのみで組み立てる。
// 🔴 グラフ描画ライブラリ（Chart.js等）は使わず、地図（.cell）と同じくCSS gridベースの
// 自作コンポーネントにする（「ビルドツールを増やさない」方針）。

import { getDisplayMode } from "./display-mode.js";
import { fetchTeamDistance } from "./api.js";
import { getLastDistanceData } from "./summary.js";

const scrim = document.getElementById("distanceScrim");
const panel = document.getElementById("distancePanel");
const closeButton = document.getElementById("distanceCloseButton");
const errorEl = document.getElementById("distanceError");
const totalEl = document.getElementById("distanceTotal");
const totalMineWrapEl = document.getElementById("distanceTotalMineWrap");
const totalMineEl = document.getElementById("distanceTotalMine");
const emptyEl = document.getElementById("distanceEmpty");
const detailEl = document.getElementById("distanceDetail");
const chartEl = document.getElementById("distanceChart");
const conversionEl = document.getElementById("distanceConversion");
const membersWrapEl = document.getElementById("distanceMembersWrap");
const membersListEl = document.getElementById("distanceMembersList");

let lastFocusedEl = null;

// 日本縦断（北海道〜鹿児島）のおよその距離。地球1周（約40,000km）は遠すぎ、
// 東京〜大阪（約500km）は近すぎるため、地理感覚としてイメージしやすい中間の
// 目安に採用した（design.md 4.11節、開発者判断）。
const JAPAN_TRANSIT_KM = 3000;

function showError(message) {
  errorEl.textContent = message;
}

// サーバーの月別集計（fetchTeamDistanceMonthly／fetchPersonalDistanceMonthly）は
// 「距離が入力された月」しか返さない（distance_km IS NOT NULLで絞るクエリのため）。
// 記録が無い月もグラフの列として抜け落ちないよう、直近12ヶ月（当月含む）の軸を
// 先にここで作ってから、サーバーの値を当てはめる。
function buildLast12MonthKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function renderChart(monthly) {
  const byMonth = new Map((monthly || []).map((row) => [row.month, row.distanceKm]));
  const keys = buildLast12MonthKeys();
  const values = keys.map((key) => byMonth.get(key) ?? 0);
  const max = Math.max(...values, 0.1); // 全月0でも高さ計算式（value/max）が0除算にならないための下限

  chartEl.textContent = "";
  keys.forEach((key, i) => {
    const value = values[i];
    const col = document.createElement("div");
    col.className = "dist-chart-col";

    const valueLabel = document.createElement("span");
    valueLabel.className = "dist-chart-value";
    valueLabel.textContent = value > 0 ? value.toFixed(1) : "";
    col.appendChild(valueLabel);

    const bar = document.createElement("div");
    bar.className = "dist-chart-bar";
    // 値がある月は最低4%の高さを保証し、0のバーと見分けが付くようにする。
    bar.style.height = `${value > 0 ? Math.max((value / max) * 100, 4) : 0}%`;
    col.appendChild(bar);

    const monthLabel = document.createElement("span");
    monthLabel.className = "dist-chart-month";
    monthLabel.textContent = key.slice(5); // "2026-08" → "08"
    col.appendChild(monthLabel);

    chartEl.appendChild(col);
  });
}

function renderMembers(members) {
  membersListEl.textContent = "";
  members.forEach((member) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = member.nickname;
    const value = document.createElement("span");
    value.textContent = `${member.distanceKm.toFixed(1)} km`;
    li.appendChild(name);
    li.appendChild(value);
    membersListEl.appendChild(li);
  });
}

function renderConversion(totalKm) {
  const pct = (totalKm / JAPAN_TRANSIT_KM) * 100;
  conversionEl.textContent = `日本縦断（約${JAPAN_TRANSIT_KM.toLocaleString()}km）の${pct.toFixed(1)}%`;
}

// 距離の記録が1件も無い（totalKm===0）場合は、空の棒グラフや0%換算を見せても
// 意味が無いため、専用の案内文だけを表示する（design.md 4.11節、開発者確認事項）。
function render({ totalKm, mineKm, monthly, members }) {
  totalEl.textContent = totalKm.toFixed(1);
  const showMine = typeof mineKm === "number";
  totalMineWrapEl.hidden = !showMine;
  if (showMine) {
    totalMineEl.textContent = mineKm.toFixed(1);
  }

  const isEmpty = totalKm === 0;
  emptyEl.hidden = !isEmpty;
  detailEl.hidden = isEmpty;
  if (isEmpty) {
    return;
  }

  renderChart(monthly);
  renderConversion(totalKm);

  const hasMembers = members.length > 0;
  membersWrapEl.hidden = !hasMembers;
  if (hasMembers) {
    renderMembers(members);
  }
}

function openPanel() {
  lastFocusedEl = document.activeElement;
  panel.removeAttribute("aria-hidden");
  panel.classList.add("open");
  scrim.classList.add("open");
  closeButton.focus();
}

function closePanel() {
  panel.classList.remove("open");
  scrim.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }
}

// 個人モードの累計・月別内訳は直近のGET /api/summary結果（summary.js）を再利用する
// （同じデータをもう一度取りに行かない）。チームモードの月別・メンバー別だけは
// シートを開いたときにGET /api/teams/:id/distanceを遅延取得する。
export async function openDistanceSheet() {
  showError("");
  totalMineWrapEl.hidden = true;
  emptyEl.hidden = true;
  detailEl.hidden = true;
  totalEl.textContent = "…";
  openPanel();

  const { totals, monthlyDistanceKm } = getLastDistanceData();
  if (!totals) {
    showError("集計情報を取得できませんでした。開き直してください。");
    return;
  }

  const { mode, teamId } = getDisplayMode();
  let monthly = monthlyDistanceKm;
  let members = [];

  if (mode === "team") {
    try {
      const res = await fetchTeamDistance(teamId);
      if (!res.ok) {
        showError("走行距離の詳細を取得できませんでした。しばらくしてからもう一度お試しください。");
        return;
      }
      const data = await res.json();
      monthly = data.monthly ?? [];
      members = data.members ?? [];
    } catch {
      showError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
      return;
    }
  }

  render({
    totalKm: totals.distanceKm,
    mineKm: mode === "team" ? totals.distanceKmMine : undefined,
    monthly,
    members,
  });
}

closeButton?.addEventListener("click", closePanel);
scrim?.addEventListener("click", closePanel);
