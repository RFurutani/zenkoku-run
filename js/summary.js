// /api/summary の結果を、地図・数値サマリー・地方別に描画する（T-15.5）。
// CLAUDE.mdセキュリティ規約8：サーバー由来の文字列はinnerHTMLで描画しない。
// 県名・数値・地方名はすべてtextContentまたはcreateElementで組み立てる。

import { LAYOUT, REGION, RORDER, RTOTAL } from "./map-layout.js";
import { fetchSummary } from "./api.js";
import { openPrefSheet } from "./pref-sheet.js";
import { getDisplayMode } from "./display-mode.js";
import { openDistanceSheet } from "./distance-sheet.js";

const mapEl = document.getElementById("map");
const ticksEl = document.getElementById("ticks");
const regionsEl = document.getElementById("regions");
const doneEl = document.getElementById("done");
const pctEl = document.getElementById("pct");
const prefsTotalEl = document.getElementById("prefsTotal");
const cityDoneEl = document.getElementById("cityDone");
const citiesTotalEl = document.getElementById("citiesTotal");
const goldNEl = document.getElementById("goldN");
const nationalBadgeEl = document.getElementById("nationalBadge");
const summaryErrorEl = document.getElementById("summary-error");
const prefsMineWrapEl = document.getElementById("prefsMineWrap");
const prefsMineEl = document.getElementById("prefsMine");
const citiesMineWrapEl = document.getElementById("citiesMineWrap");
const citiesMineEl = document.getElementById("citiesMine");
const distanceRowEl = document.getElementById("distanceRow");
const distanceKmEl = document.getElementById("distanceKm");
const distanceMineWrapEl = document.getElementById("distanceMineWrap");
const distanceMineEl = document.getElementById("distanceMine");

// バッジ判定用に、直近のmissingInApiガードを通過したデータだけを保持する（T-39）。
// pref-sheet.jsのgetCurrentBadgeState()呼び出しは常にこの2つを経由するため、
// LAYOUTとAPIのprefNameが食い違った回のデータでバッジ判定が行われることはない。
let lastByPrefName = null;
let lastTotals = null;

function showSummaryError(message) {
  summaryErrorEl.textContent = message;
}

// タップまたはEnter/Spaceで県詳細シートを開く（T-16）。
// cell.dataset.prefCodeはapplyStages()でAPI応答を受け取った後に設定されるため、
// まだ設定されていない（データ取得中）場合は何もしない。
function openSheetForCell(cell) {
  if (!cell.dataset.prefCode) {
    return;
  }
  openPrefSheet(cell.dataset.prefCode, cell);
}

// LAYOUTの47件ぶんのマスを描画する。段階（色）はまだ付けず、枠だけ作る。
function buildMapCells() {
  mapEl.textContent = "";
  LAYOUT.forEach(([prefName, col, row, colSpan, rowSpan]) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.pref = prefName;
    cell.style.gridColumn = `${col} / span ${colSpan}`;
    cell.style.gridRow = `${row} / span ${rowSpan}`;
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", `${prefName}県の詳細を開く`);

    const label = document.createElement("span");
    label.textContent = prefName;
    cell.appendChild(label);

    cell.addEventListener("click", () => openSheetForCell(cell));
    cell.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openSheetForCell(cell);
      }
    });

    mapEl.appendChild(cell);
  });
}

function applyStages(byPrefName) {
  mapEl.querySelectorAll(".cell").forEach((cell) => {
    const row = byPrefName.get(cell.dataset.pref);
    cell.classList.remove("t1", "t2", "t3", "t4");
    if (row.stage > 0) {
      cell.classList.add(`t${row.stage}`);
    }
    // 県詳細シート（T-16）を開く際にprefCodeが必要なため、ここで持たせておく。
    cell.dataset.prefCode = row.prefCode;
  });
}

// 47目盛りバー（design.md 5章）。段階の高い県から並べる。
function renderTicks(byPrefName) {
  ticksEl.textContent = "";
  LAYOUT.map(([prefName]) => byPrefName.get(prefName))
    .sort((a, b) => b.stage - a.stage)
    .forEach((row) => {
      const tick = document.createElement("i");
      if (row.stage > 0) {
        tick.classList.add(`t${row.stage}`);
      }
      ticksEl.appendChild(tick);
    });
}

// 地方バッジ（T-39）の判定：地方内の全県が完全制覇（stage===4）かどうか。
// renderRegions()の「着手県数」（citiesConquered > 0を数える）とは別の、
// もっと厳しい条件なので独立した集計にする。既存の着手県数のロジックは変更しない。
function regionFullyConquered(byPrefName, regionName) {
  return Object.keys(REGION)
    .filter((prefName) => REGION[prefName] === regionName)
    .every((prefName) => byPrefName.get(prefName).stage === 4);
}

function computeRegionBadges(byPrefName) {
  const badges = new Map();
  RORDER.forEach((regionName) => {
    badges.set(regionName, regionFullyConquered(byPrefName, regionName));
  });
  return badges;
}

function renderRegions(byPrefName) {
  regionsEl.textContent = "";
  RORDER.forEach((regionName) => {
    const conqueredCount = Object.keys(REGION).filter(
      (prefName) => REGION[prefName] === regionName && byPrefName.get(prefName).citiesConquered > 0
    ).length;

    const row = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = regionName;

    // .regions divはjustify-content:space-betweenで2要素（label／右側）を左右に振る。
    // countとbadgeは同じ右側グループにまとめ、常時2要素構成を保つ
    // （バッジの有無でレイアウトの列数が変わらないようにするため）。
    const right = document.createElement("span");
    right.className = "region-right";
    const count = document.createElement("b");
    count.textContent = `${conqueredCount}/${RTOTAL[regionName]}`;
    right.appendChild(count);

    if (regionFullyConquered(byPrefName, regionName)) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "🏆";
      badge.setAttribute("aria-label", `${regionName} 全県コンプリート`);
      right.appendChild(badge);
    }

    row.appendChild(label);
    row.appendChild(right);
    regionsEl.appendChild(row);
  });
}

function renderTotals(totals) {
  doneEl.textContent = totals.prefsConquered;
  prefsTotalEl.textContent = totals.prefsTotal;
  cityDoneEl.textContent = totals.citiesConquered;
  citiesTotalEl.textContent = totals.citiesTotal;
  goldNEl.textContent = totals.fullyConqueredPrefs;

  pctEl.textContent = "";
  pctEl.appendChild(document.createTextNode(totals.percentage.toFixed(1)));
  const small = document.createElement("small");
  small.textContent = "%";
  pctEl.appendChild(small);

  const achievedNational = totals.fullyConqueredPrefs === 47;
  nationalBadgeEl.hidden = !achievedNational;
  nationalBadgeEl.textContent = achievedNational ? "👑 全国制覇" : "";

  // 「あなたN」の内訳（画面仕様④）。totals.prefsConqueredMineはチームモードの
  // レスポンスにしか無い（design.md 4.10.16・4.10.17節）ため、このフィールドの
  // 有無だけで出し分ける。表示モードの値そのものは参照しない。
  const showMine = typeof totals.prefsConqueredMine === "number";
  prefsMineWrapEl.hidden = !showMine;
  citiesMineWrapEl.hidden = !showMine;
  if (showMine) {
    prefsMineEl.textContent = totals.prefsConqueredMine;
    citiesMineEl.textContent = totals.citiesConqueredMine;
  }

  // 走行距離（T-49、design.md 4.11節）。「あなた」の内訳は都道府県・市の件数と違い
  // 単位（km）が無いと意味が通らないため、あえてbの外にも"km"を書く
  // （design.md 4.11節「表示」の決定どおり）。
  distanceKmEl.textContent = totals.distanceKm.toFixed(1);
  const showDistanceMine = typeof totals.distanceKmMine === "number";
  distanceMineWrapEl.hidden = !showDistanceMine;
  if (showDistanceMine) {
    distanceMineEl.textContent = totals.distanceKmMine.toFixed(1);
  }
}

// 「達成した瞬間」の演出（T-39）用に、直近のバッジ状態を外部（pref-sheet.js）へ渡す。
// missingInApiガードを通過したデータのみが lastByPrefName/lastTotals に入るため
// （renderSummary()参照）、ガードに守られていない生データでバッジ判定されることはない。
export function getCurrentBadgeState() {
  if (!lastByPrefName || !lastTotals) {
    return { regions: new Map(), national: false };
  }
  return {
    regions: computeRegionBadges(lastByPrefName),
    national: lastTotals.fullyConqueredPrefs === 47,
  };
}

// 戻り値は成否（true/false）。例外を投げず内部でエラー表示まで完結させる作りのため、
// 呼び出し側が成否を見て後続処理を分けたい場合（T-17登録成功後の再取得など）は
// この戻り値を使う（Promise.all/allSettledの reject 検知では拾えないため）。
export async function renderSummary() {
  showSummaryError("");
  buildMapCells();

  let data;
  try {
    const { mode, teamId } = getDisplayMode();
    const res = await fetchSummary(mode, teamId);
    if (!res.ok) {
      showSummaryError("集計情報の取得に失敗しました。しばらくしてからもう一度お試しください。");
      return false;
    }
    data = await res.json();
  } catch {
    showSummaryError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
    return false;
  }

  const byPrefName = new Map(data.prefectures.map((row) => [row.prefName, row]));

  // LAYOUTの県名とAPIのprefNameが1件でも食い違うと、その県が地図から漏れる。
  // 「地図に描いて47件の対応を確認する」という今回の目的そのものに関わるため、
  // 黙って未制覇扱いにせず、目立つエラーとして表示する。
  const missingInApi = LAYOUT.map(([prefName]) => prefName).filter((name) => !byPrefName.has(name));
  if (missingInApi.length > 0) {
    showSummaryError(
      `地図の県名とサーバーの都道府県名が一致しません（${missingInApi.join("、")}）。開発者に連絡してください。`
    );
    console.error("map-layout.jsのLAYOUTとAPIのprefNameが一致しない県があります:", missingInApi);
    return false;
  }

  // ここまでガードを通過したデータだけをバッジ判定用に保持する（getCurrentBadgeState()参照）。
  lastByPrefName = byPrefName;
  lastTotals = data.totals;

  applyStages(byPrefName);
  renderTicks(byPrefName);
  renderRegions(byPrefName);
  renderTotals(data.totals);
  return true;
}

// 走行距離の行（T-49）。タップまたはEnter/Spaceで可視化シートを開く（M4、.cellと同じ
// キーボード操作パターン）。地図のセルと違い要素は再生成されない静的なDOMのため、
// リスナーはモジュール読み込み時に1回だけ登録すればよい。
distanceRowEl.addEventListener("click", () => openDistanceSheet());
distanceRowEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openDistanceSheet();
  }
});
