// 県詳細シート（T-16）。地図のセルをタップ／Enterすると、この県の市一覧・走行記録を表示する。
// CLAUDE.mdセキュリティ規約8：サーバー由来の文字列（県名・市名・メモ）はinnerHTMLで描画せず、
// textContentまたはcreateElementで組み立てる。
// 登録・修正フォームはT-17（POST /api/records）実装後に追加する。今回は表示専用。

import { fetchPrefDetail } from "./api.js";

const scrimEl = document.getElementById("scrim");
const sheetEl = document.getElementById("sheet");
const titleEl = document.getElementById("sheetTitle");
const gaugeEl = document.getElementById("sheetGauge");
const statEl = document.getElementById("sheetStat");
const errorEl = document.getElementById("sheetError");
const chipsEl = document.getElementById("sheetChips");
const runsEl = document.getElementById("sheetRuns");
const closeButton = document.getElementById("sheetCloseButton");

let lastFocusedEl = null;

function showSheetError(message) {
  errorEl.textContent = message;
}

function renderChips(cities) {
  chipsEl.textContent = "";
  cities.forEach((city) => {
    const chip = document.createElement("span");
    chip.className = "chip" + (city.conquered ? " on" : "");
    chip.textContent = city.cityName;
    chipsEl.appendChild(chip);
  });
}

function renderRuns(runs) {
  runsEl.textContent = "";
  if (runs.length === 0) {
    const li = document.createElement("li");
    li.style.borderLeftColor = "var(--rule)";
    li.style.color = "var(--ink-soft)";
    li.textContent = "まだ記録がありません";
    runsEl.appendChild(li);
    return;
  }

  runs.forEach((run) => {
    const li = document.createElement("li");
    const dateSpan = document.createElement("span");
    dateSpan.className = "d";
    dateSpan.textContent = run.runDate;
    li.appendChild(dateSpan);
    li.appendChild(document.createTextNode(run.cityName));
    if (run.memo) {
      const memoDiv = document.createElement("div");
      memoDiv.className = "memo";
      memoDiv.textContent = run.memo;
      li.appendChild(memoDiv);
    }
    runsEl.appendChild(li);
  });
}

export async function openPrefSheet(prefCode, triggerEl) {
  lastFocusedEl = triggerEl || document.activeElement;
  showSheetError("");
  titleEl.textContent = "読み込み中…";
  gaugeEl.style.width = "0%";
  statEl.textContent = "";
  chipsEl.textContent = "";
  runsEl.textContent = "";

  sheetEl.removeAttribute("aria-hidden");
  sheetEl.classList.add("open");
  scrimEl.classList.add("open");
  closeButton.focus();

  let res;
  try {
    res = await fetchPrefDetail(prefCode);
  } catch {
    showSheetError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
    return;
  }
  if (!res.ok) {
    showSheetError("県の詳細情報を取得できませんでした。しばらくしてからもう一度お試しください。");
    return;
  }
  const data = await res.json();

  titleEl.textContent = `${data.prefName}県`;
  const rate = data.citiesTotal > 0 ? data.citiesConquered / data.citiesTotal : 0;
  gaugeEl.style.width = `${Math.min(rate * 100, 100)}%`;

  const strong = document.createElement("b");
  strong.textContent = data.citiesConquered;
  statEl.appendChild(strong);
  statEl.appendChild(document.createTextNode(` / ${data.citiesTotal} 市`));

  renderChips(data.cities);
  renderRuns(data.runs);
}

export function closePrefSheet() {
  sheetEl.classList.remove("open");
  scrimEl.classList.remove("open");
  sheetEl.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }
}

closeButton.addEventListener("click", closePrefSheet);
scrimEl.addEventListener("click", closePrefSheet);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheetEl.classList.contains("open")) {
    closePrefSheet();
  }
});
