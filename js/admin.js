// 管理者向け利用状況ダッシュボード（T-61 M3、design.md 4.16節）。
// フッターの「管理」ボタン（users.is_admin = 1 の人にだけ出る）から開く。
// 既存の.sheet/.scrimを流用する（診断・設定・規約・チーム通知・可視化に続く6枚目）。
//
// 🔴 グラフ描画ライブラリ（Chart.js等）は使わず、distance-sheet.js（T-49 M4）と同じ
//    CSS gridベースの自作コンポーネントにする（「ビルドツールを増やさない」方針）。
//    色も既存の段階カラー変数だけを使い、新しい色を増やさない（開発者指示・2026-09-10）。
// CLAUDE.mdセキュリティ規約8：サーバー由来の文字列はinnerHTMLで描画せず、
//    textContent／createElementのみで組み立てる。

import { fetchAdminDashboard } from "./api.js";

const adminButton = document.getElementById("adminButton");
const scrim = document.getElementById("adminScrim");
const panel = document.getElementById("adminPanel");
const closeButton = document.getElementById("adminCloseButton");
const errorEl = document.getElementById("adminError");
const loadingEl = document.getElementById("adminLoading");
const detailEl = document.getElementById("adminDetail");
const scopeEl = document.getElementById("adminScope");
const usersListEl = document.getElementById("adminUsersList");
const weeklyChartEl = document.getElementById("adminWeeklyChart");
const momentumEl = document.getElementById("adminMomentum");
const weekdayChartEl = document.getElementById("adminWeekdayChart");

// サーバーは16週ぶん返す（直近8週とその前8週を比べるため）が、画面に出すのは
// 直近12週だけにする（design.md 4.16節。スマートフォンの幅で16本並べるとバーが細くなりすぎる）。
const WEEKS_SHOWN = 12;
const MOMENTUM_WEEKS = 8;
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

let lastFocusedEl = null;
let loadInFlight = false;

function showError(message) {
  errorEl.textContent = message;
}

// 'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS' から 'M/D' を作る。
// ★new Date(文字列)は使わない。'2026-09-05 11:37:19'（Tなし・タイムゾーンなし）の
//   解釈はブラウザ依存で、環境によってはローカル時刻として読み替えられ日付がずれる。
//   サーバーが既にJSTへ換算済みの文字列を返している（design.md 4.16節）ため、
//   ここでは文字列として切り出すだけにして、時差計算を二重にしない。
function formatMonthDay(isoLike) {
  const [, month, day] = isoLike.slice(0, 10).split("-");
  return `${Number(month)}/${Number(day)}`;
}

// 距離・最終登録日は該当が無ければサーバーがnullを返す（0.0kmや未登録と区別するため）。
// 画面では「—」と出す（distance-sheet.jsと同じ規約、design.md 4.16節）。
function formatDistance(km) {
  return km === null ? "距離 —" : `${km.toFixed(1)} km`;
}

function formatLastRegistered(lastRegisteredAt) {
  return lastRegisteredAt === null ? "最終 —" : `最終 ${formatMonthDay(lastRegisteredAt)}`;
}

// 利用者ごとの累計。1人1行を2段（名前＋制覇数／その他の集計）で組む。
// ★表（table）にせず縦積みにした理由：6項目を420px幅の1行に並べると各列が
//   潰れてしまうため（品質基準：スマートフォン表示を最優先）。
function renderUsers(users) {
  usersListEl.textContent = "";
  users.forEach((user) => {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "admin-user-head";
    const name = document.createElement("span");
    name.className = "admin-user-name";
    name.textContent = user.nickname;
    const conquest = document.createElement("span");
    conquest.className = "admin-user-conquest";
    conquest.textContent = `制覇 ${user.conquestCount}`;
    head.appendChild(name);
    head.appendChild(conquest);

    const stats = document.createElement("div");
    stats.className = "admin-user-stats";
    stats.textContent = [
      formatDistance(user.totalDistanceKm),
      `写真 ${user.photoCount}`,
      formatLastRegistered(user.lastRegisteredAt),
      `開始から${user.daysSinceJoined}日`,
    ].join(" ・ ");

    li.appendChild(head);
    li.appendChild(stats);
    usersListEl.appendChild(li);
  });
}

// 棒グラフ1本ぶんの列を作る。週別・曜日別で同じ形を使う（distance-sheet.jsの
// renderChart()を踏襲。値が0のバーは高さ0にし、値があるバーは最低4%の高さを
// 保証して「0」と「わずかにある」を見分けられるようにする）。
function buildChartColumn(value, max, label) {
  const col = document.createElement("div");
  col.className = "admin-chart-col";

  const valueLabel = document.createElement("span");
  valueLabel.className = "admin-chart-value";
  valueLabel.textContent = value > 0 ? String(value) : "";
  col.appendChild(valueLabel);

  const bar = document.createElement("div");
  bar.className = "admin-chart-bar";
  bar.style.height = `${value > 0 ? Math.max((value / max) * 100, 4) : 0}%`;
  col.appendChild(bar);

  const axisLabel = document.createElement("span");
  axisLabel.className = "admin-chart-label";
  axisLabel.textContent = label;
  col.appendChild(axisLabel);

  return col;
}

function renderChart(el, rows) {
  // 全て0でも高さ計算式（value/max）が0除算にならないよう下限1を置く。
  const max = Math.max(...rows.map((row) => row.value), 1);
  el.textContent = "";
  rows.forEach((row) => el.appendChild(buildChartColumn(row.value, max, row.label)));
}

function renderWeekly(weekly) {
  renderChart(
    weeklyChartEl,
    weekly.slice(-WEEKS_SHOWN).map((row) => ({
      value: row.count,
      label: formatMonthDay(row.weekStart),
    }))
  );
}

// 直近8週の勢い。サーバーは16週ぶんの生データを返すだけで、比較はここで行う
// （design.md 4.16節：軽い計算はフロント側に置く方針）。
// ★減少のときだけREDで強調する（開発者指示：強調が必要な箇所だけ既存のREDを使う）。
//   「利用が落ちている」は管理者が気づきたい向きの変化のため、そこに注意を向ける。
function renderMomentum(weekly) {
  const recent = weekly.slice(-MOMENTUM_WEEKS);
  const previous = weekly.slice(-MOMENTUM_WEEKS * 2, -MOMENTUM_WEEKS);
  const sum = (rows) => rows.reduce((total, row) => total + row.count, 0);
  const recentCount = sum(recent);
  const previousCount = sum(previous);
  const diff = recentCount - previousCount;

  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  const sign = diff > 0 ? `+${diff}` : String(diff);
  const change = diff === 0 ? "横ばい" : `${arrow} ${sign}件`;

  momentumEl.textContent =
    `直近${MOMENTUM_WEEKS}週 ${recentCount}件` +
    `（その前の${MOMENTUM_WEEKS}週は ${previousCount}件、${change}）`;
  momentumEl.classList.toggle("admin-momentum-down", diff < 0);
}

function renderWeekday(weekday) {
  renderChart(
    weekdayChartEl,
    // サーバーは月=1〜日=7の順で必ず7件返す（0件の曜日も含む）。
    weekday.map((row) => ({ value: row.count, label: WEEKDAY_LABELS[row.weekday - 1] }))
  );
}

// 🔴 対象範囲の注記（T-62、design.md 4.16節）。この画面はチーム所属者だけを
// 集計しているため、チームに入っていない利用者は表にもグラフにも出てこない。
// テスト用アカウントを消すのが目的だが、同じ条件は「個人モードだけの実利用者」も
// 消してしまう。その人が静かに居なくなるのを防ぐため、除外された人数を常に出す。
// ★対象外が0人でも省略しない（0なのか表示が壊れているのか区別できなくなるため）。
// ★excludedUserCountが数値でないのは、新しい画面が古いWorkerと組み合わさっている
//   状態（公開順序は「Worker→画面」のためまず起きないが、古いJSがキャッシュに
//   残っている等はありうる）。「対象外 undefined人」と出すくらいなら、
//   取得できていないことをそのまま書く（黙って0人に見せない）。
function renderScope(data) {
  const targeted = `対象：チーム所属者 ${data.users.length}人`;
  scopeEl.textContent =
    typeof data.excludedUserCount === "number"
      ? `${targeted}（対象外 ${data.excludedUserCount}人）`
      : `${targeted}（対象外の人数を取得できませんでした）`;
}

function render(data) {
  renderScope(data);
  renderUsers(data.users);
  renderWeekly(data.weekly);
  renderMomentum(data.weekly);
  renderWeekday(data.weekday);
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

// 開くたびに取り直す（管理者が「いま」の状況を見る画面のため、
// 前回開いたときの値をそのまま見せない）。
async function openAdminPanel() {
  if (loadInFlight) {
    return;
  }
  loadInFlight = true;
  showError("");
  detailEl.hidden = true;
  loadingEl.hidden = false;
  openPanel();

  try {
    const res = await fetchAdminDashboard();
    if (res.status === 403) {
      // ボタンが出ている＝管理者のはずなので、通常は起こらない。起きたとしたら
      // is_adminが外された後に画面を開き直していない状態。再ログインで解消する。
      showError("この画面を開く権限がありません。ログインし直してください。");
      return;
    }
    if (!res.ok) {
      showError("利用状況を取得できませんでした。しばらくしてからもう一度お試しください。");
      return;
    }
    render(await res.json());
    detailEl.hidden = false;
  } catch {
    showError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
  } finally {
    loadingEl.hidden = true;
    loadInFlight = false;
  }
}

adminButton?.addEventListener("click", openAdminPanel);
closeButton?.addEventListener("click", closePanel);
scrim?.addEventListener("click", closePanel);
