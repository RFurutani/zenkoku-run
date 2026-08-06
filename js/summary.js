// /api/summary の結果を、地図・数値サマリー・地方別に描画する（T-15.5）。
// CLAUDE.mdセキュリティ規約8：サーバー由来の文字列はinnerHTMLで描画しない。
// 県名・数値・地方名はすべてtextContentまたはcreateElementで組み立てる。

import { LAYOUT, REGION, RORDER, RTOTAL } from "./map-layout.js";
import { fetchSummary } from "./api.js";
import { openPrefSheet } from "./pref-sheet.js";

const mapEl = document.getElementById("map");
const ticksEl = document.getElementById("ticks");
const regionsEl = document.getElementById("regions");
const doneEl = document.getElementById("done");
const pctEl = document.getElementById("pct");
const prefsTotalEl = document.getElementById("prefsTotal");
const cityDoneEl = document.getElementById("cityDone");
const citiesTotalEl = document.getElementById("citiesTotal");
const goldNEl = document.getElementById("goldN");
const summaryErrorEl = document.getElementById("summary-error");

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

function renderRegions(byPrefName) {
  regionsEl.textContent = "";
  RORDER.forEach((regionName) => {
    const conqueredCount = Object.keys(REGION).filter(
      (prefName) => REGION[prefName] === regionName && byPrefName.get(prefName).citiesConquered > 0
    ).length;

    const row = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = regionName;
    const count = document.createElement("b");
    count.textContent = `${conqueredCount}/${RTOTAL[regionName]}`;
    row.appendChild(label);
    row.appendChild(count);
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
}

export async function renderSummary() {
  showSummaryError("");
  buildMapCells();

  let data;
  try {
    const res = await fetchSummary();
    if (!res.ok) {
      showSummaryError("集計情報の取得に失敗しました。しばらくしてからもう一度お試しください。");
      return;
    }
    data = await res.json();
  } catch {
    showSummaryError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
    return;
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
    return;
  }

  applyStages(byPrefName);
  renderTicks(byPrefName);
  renderRegions(byPrefName);
  renderTotals(data.totals);
}
