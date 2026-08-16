// 県詳細シート（T-16）。地図のセルをタップ／Enterすると、この県の市一覧・走行記録を表示する。
// 走行記録の登録フォーム（T-17）もここに含む。
// CLAUDE.mdセキュリティ規約8：サーバー由来の文字列（県名・市名・メモ）はinnerHTMLで描画せず、
// textContentまたはcreateElementで組み立てる。

import { fetchPrefDetail, createRecord } from "./api.js";
import { renderSummary, getCurrentBadgeState } from "./summary.js";

const scrimEl = document.getElementById("scrim");
const sheetEl = document.getElementById("sheet");
const titleEl = document.getElementById("sheetTitle");
const prefBadgeEl = document.getElementById("sheetPrefBadge");
const gaugeEl = document.getElementById("sheetGauge");
const statEl = document.getElementById("sheetStat");
const errorEl = document.getElementById("sheetError");
const chipsEl = document.getElementById("sheetChips");
const runsEl = document.getElementById("sheetRuns");
const closeButton = document.getElementById("sheetCloseButton");
const celebrationEl = document.getElementById("celebrationToast");

const formEl = document.getElementById("recordForm");
const fCityEl = document.getElementById("fCity");
const fDateEl = document.getElementById("fDate");
const fMemoEl = document.getElementById("fMemo");
const formErrorEl = document.getElementById("formError");
const formSuccessEl = document.getElementById("formSuccess");
const submitButtonEl = document.getElementById("recordSubmitButton");

let lastFocusedEl = null;
// 開いている県のコード・直近取得データ。フォームの重複判定（F-27）と、
// 登録成功後の再取得はこれを使う（追加のGETは行わない）。
let currentPrefCode = null;
let currentPrefData = null;
let submitInFlight = false;

function showSheetError(message) {
  errorEl.textContent = message;
}

function showFormError(message) {
  formErrorEl.textContent = message;
}

function showFormSuccess(message) {
  formSuccessEl.textContent = message;
}

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
    // registrantNameはT-39で追加（将来のチームモードT-36の下地。design.md 4.6節）。
    // 現状は常に自分自身の名前だが、表示コードは複数人分を想定して作る。
    if (run.registrantName) {
      const whoSpan = document.createElement("span");
      whoSpan.className = "who";
      whoSpan.textContent = run.registrantName;
      li.appendChild(whoSpan);
    }
    if (run.memo) {
      const memoDiv = document.createElement("div");
      memoDiv.className = "memo";
      memoDiv.textContent = run.memo;
      li.appendChild(memoDiv);
    }
    runsEl.appendChild(li);
  });
}

// 市の<select>を、この県の市一覧（GET /api/pref/:code）から組み立てる。
// 制覇済みかどうかは記号ではなく日本語テキストで示す（開発者指示・2026-08-08）。
function renderCitySelect(cities) {
  fCityEl.textContent = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  placeholder.disabled = true;
  placeholder.selected = true;
  fCityEl.appendChild(placeholder);

  cities.forEach((city) => {
    const option = document.createElement("option");
    option.value = city.cityCode;
    option.textContent = city.conquered ? `${city.cityName}（制覇済み）` : city.cityName;
    fCityEl.appendChild(option);
  });
}

// フォームの入力値・メッセージをまとめてリセットする。開いたとき・登録成功時のみ呼ぶ
// （エラー時は入力値を保持する方針のため、ここは呼ばない）。
function resetForm() {
  fCityEl.value = "";
  fDateEl.value = todayStr();
  fDateEl.max = todayStr();
  fMemoEl.value = "";
  showFormError("");
  showFormSuccess("");
}

// GET /api/pref/:code を取得して県詳細シートの表示を更新する。
// 初回オープン時と、登録成功後の再取得の両方から呼ぶ（design.md「登録成功後は
// GET /api/pref/:codeを再取得して画面を更新する」を1箇所にまとめるため）。
// 戻り値は成否（true/false）。例外を投げず内部でエラー表示まで完結させる作りのため、
// 呼び出し側が成否を見て後続処理を分けたい場合はこの戻り値を使う（summary.jsの
// renderSummary()と同じ考え方）。
async function loadAndRenderPref(prefCode) {
  showSheetError("");

  let res;
  try {
    res = await fetchPrefDetail(prefCode);
  } catch {
    showSheetError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
    return false;
  }
  if (!res.ok) {
    showSheetError("県の詳細情報を取得できませんでした。しばらくしてからもう一度お試しください。");
    return false;
  }
  const data = await res.json();
  currentPrefCode = prefCode;
  currentPrefData = data;

  titleEl.textContent = `${data.prefName}県`;
  const rate = data.citiesTotal > 0 ? data.citiesConquered / data.citiesTotal : 0;
  gaugeEl.style.width = `${Math.min(rate * 100, 100)}%`;

  statEl.textContent = "";
  const strong = document.createElement("b");
  strong.textContent = data.citiesConquered;
  statEl.appendChild(strong);
  statEl.appendChild(document.createTextNode(` / ${data.citiesTotal} 市`));

  // 県バッジの常時表示（T-39）。達成条件はUIに出さず、達成済みかどうかだけを示す。
  const prefAchieved = data.citiesTotal > 0 && data.citiesConquered === data.citiesTotal;
  prefBadgeEl.hidden = !prefAchieved;
  prefBadgeEl.textContent = prefAchieved ? `🏅 全${data.citiesTotal}市 制覇` : "";

  renderChips(data.cities);
  renderRuns(data.runs);
  renderCitySelect(data.cities);
  return true;
}

export async function openPrefSheet(prefCode, triggerEl) {
  lastFocusedEl = triggerEl || document.activeElement;
  resetForm();
  titleEl.textContent = "読み込み中…";
  prefBadgeEl.hidden = true;
  prefBadgeEl.textContent = "";
  gaugeEl.style.width = "0%";
  statEl.textContent = "";
  chipsEl.textContent = "";
  runsEl.textContent = "";
  fCityEl.textContent = "";

  sheetEl.removeAttribute("aria-hidden");
  sheetEl.classList.add("open");
  scrimEl.classList.add("open");
  closeButton.focus();

  await loadAndRenderPref(prefCode);
}

export function closePrefSheet() {
  sheetEl.classList.remove("open");
  scrimEl.classList.remove("open");
  sheetEl.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }
}

// F-27（同一市・同一日の重複登録）の確認ダイアログ。将来、自前モーダルに差し替える
// 可能性があるため呼び出しをこの関数1つに閉じ込める（呼び出し側はconfirm()を直接使わない）。
// 弱点：ブラウザによっては同一ページでconfirm()が繰り返し出た場合に
// 「このページでは今後ダイアログを表示しない」を提示することがあり、その場合は
// ユーザー操作なしにfalse（キャンセル扱い）が返る。個人利用前提のため今回は許容する。
function confirmDuplicateRun() {
  return window.confirm("この日はすでに記録があります。追加しますか？");
}

// renderSummary()は地図の47マスを作り直すため、シートを開くきっかけになった
// マス（closePrefSheet()でフォーカスを戻す先）が古いDOM参照のまま残ってしまう。
// 登録成功後にrenderSummary()を呼んだ直後は、同じ県コードの新しいマスを
// 探し直してlastFocusedElを差し替える。
function reattachTriggerAfterSummaryRerender() {
  if (!currentPrefCode) {
    return;
  }
  const freshCell = document.querySelector(`#map .cell[data-pref-code="${currentPrefCode}"]`);
  if (freshCell) {
    lastFocusedEl = freshCell;
  }
}

// 「達成した瞬間」の演出（T-39）。DBには何も保存せず、登録前後の状態をブラウザの
// メモリ上で比較するだけ（design.md 4.6節）。この方式の限界（POST /api/records を
// 経由せずに達成した場合は演出が出ない）も同節に明記してある。
let celebrationQueue = [];
let celebrationShowing = false;

function showNextCelebration() {
  if (celebrationQueue.length === 0) {
    celebrationShowing = false;
    celebrationEl.hidden = true;
    celebrationEl.textContent = "";
    return;
  }
  celebrationShowing = true;
  celebrationEl.textContent = celebrationQueue.shift();
  celebrationEl.hidden = false;
  setTimeout(showNextCelebration, 3000);
}

// 複数バッジが同時に初達成した場合に備え、キューに積んで1つずつ表示する
// （現状のデータでは同時発生しないが、将来のため）。
function queueCelebrations(messages) {
  if (messages.length === 0) {
    return;
  }
  celebrationQueue.push(...messages);
  if (!celebrationShowing) {
    showNextCelebration();
  }
}

// 登録前に退避しておいたprevPrefData・prevBadgeStateと、登録後の最新状態を比較し、
// 新たに達成した（＝前は未達成、今回は達成）バッジだけを演出対象にする。
function collectNewlyAchievedMessages(prevPrefData, prevBadgeState) {
  const messages = [];

  const prefJustAchieved =
    prevPrefData &&
    prevPrefData.citiesTotal > 0 &&
    prevPrefData.citiesConquered < prevPrefData.citiesTotal &&
    currentPrefData &&
    currentPrefData.citiesConquered === currentPrefData.citiesTotal;
  if (prefJustAchieved) {
    messages.push(`🏅 ${currentPrefData.prefName}県 全${currentPrefData.citiesTotal}市 制覇！`);
  }

  const newBadgeState = getCurrentBadgeState();
  newBadgeState.regions.forEach((achieved, regionName) => {
    if (achieved && !prevBadgeState.regions.get(regionName)) {
      messages.push(`🏆 ${regionName} 全県コンプリート！`);
    }
  });
  if (newBadgeState.national && !prevBadgeState.national) {
    messages.push("👑 全国制覇！");
  }

  return messages;
}

async function handleRecordSubmit(event) {
  event.preventDefault();
  if (submitInFlight) {
    return;
  }

  showFormError("");
  showFormSuccess("");

  const cityCode = fCityEl.value;
  const runDate = fDateEl.value;
  const memo = fMemoEl.value.trim();

  if (!cityCode) {
    showFormError("市を選択してください。");
    return;
  }
  if (!runDate) {
    showFormError("走行日を入力してください。");
    return;
  }

  const isDuplicate = (currentPrefData?.runs ?? []).some(
    (run) => run.cityCode === cityCode && run.runDate === runDate
  );
  if (isDuplicate && !confirmDuplicateRun()) {
    return;
  }

  submitInFlight = true;
  submitButtonEl.disabled = true;

  try {
    const res = await createRecord({ city_code: cityCode, run_date: runDate, memo });

    if (res.status === 401) {
      // このシート（フォームを含む）は#main-screenの外側にある独立した要素で、
      // auth.jsのshowLogin()/showMain()はhidden属性の切り替えのみで中身を書き換えないため、
      // 何もしなくても入力値はそのまま残る（2026-08-08確認）。もし将来.sheetが
      // #main-screenの内側に移動された場合はこの前提が崩れるため、その際は入力値の
      // 明示的な退避（例：モジュール変数への保存）が必要になる。
      showFormError("セッションが切れました。再ログインしてください。入力内容は保持されています。");
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      showFormError(
        body?.error ?? "記録の登録に失敗しました。しばらくしてからもう一度お試しください。"
      );
      return;
    }

    // 201の時点で登録は完了している。この後の再取得（画面更新）が失敗しても
    // 「登録失敗」としては扱わない。混同すると、利用者が再送信して二重登録になり、
    // しかもcurrentPrefDataが古いままだとF-27の重複確認も発動しないという
    // 最悪の組み合わせになるため（開発者指摘・2026-08-08）。
    resetForm();
    showFormSuccess("登録しました。");

    // 「達成した瞬間」の演出用に、再取得で上書きされる前の状態を退避する（T-39）。
    const prevPrefData = currentPrefData;
    const prevBadgeState = getCurrentBadgeState();

    try {
      const [prefOk, summaryOk] = await Promise.all([
        loadAndRenderPref(currentPrefCode),
        renderSummary(),
      ]);
      if (prefOk && summaryOk) {
        reattachTriggerAfterSummaryRerender();
        queueCelebrations(collectNewlyAchievedMessages(prevPrefData, prevBadgeState));
      } else {
        showFormError("登録は完了しましたが、画面の更新に失敗しました。再読み込みしてください。");
      }
    } catch {
      showFormError("登録は完了しましたが、画面の更新に失敗しました。再読み込みしてください。");
    }
  } catch {
    showFormError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。入力内容は保持されています。");
  } finally {
    submitInFlight = false;
    submitButtonEl.disabled = false;
  }
}

formEl.addEventListener("submit", handleRecordSubmit);
closeButton.addEventListener("click", closePrefSheet);
scrimEl.addEventListener("click", closePrefSheet);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheetEl.classList.contains("open")) {
    closePrefSheet();
  }
});
