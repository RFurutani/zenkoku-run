// アイコン更新のお知らせ（T-64）。T-29でアプリのアイコンを刷新したが、すでに
// ホーム画面へ追加している端末では古いアイコンが残るため、「一度削除して、
// もう一度追加する」操作を促す。既存の.sheet/.scrim（8回目の流用）と同じ
// 見た目・同じ閉じ方にそろえる。
//
// 🔴 v1.14.0で削除する一時機能（tasks.md T-64）。
//    削除するときは、このファイルを消し、auth.jsの次の2行を消せば完了する。
//      import { checkIconNotice } from "./icon-notice.js";
//      await checkIconNotice();
//    index.html・style.cssには何も足していない（DOMはこのファイル内で組み立て、
//    見た目は既存の.sheet/.scrim/.btnrowをそのまま使う）。痕跡が2ファイルに
//    閉じているのは、消し忘れ・消し残しを防ぐため。
//    🔴 ただし利用者の端末側には、localStorageのキーが v1・v2 の2つ残る
//    （v1.13.1でv2へ上げたため。下記STORAGE_KEYのコメント参照）。tasks.md T-64も参照。
//
// CLAUDE.mdセキュリティ規約8：文言はすべて固定テキストだが、innerHTMLは使わず
// createElement／textContentだけで組み立てる。

// 状態の置き場所はlocalStorage。DB（users列の追加）にしないのは、これが一時機能で
// あり、v1.14.0で消す列を本番スキーマに足す価値が無いため。端末ごとに出る形に
// なるが、「ホーム画面に追加した端末で見えればよい」お知らせなので支障はない
// （更新のお知らせ＝T-57がDBを使うのとは要件が異なる。design.md 4.12節）。
// 🔴 v1.13.1でキーをv1からv2へ上げた。v1.13.0の文面には戻り道（URL）が無く、それを
//    見た人が正しい案内を一度も見ないまま表示回数の上限に達してしまうため、全員に
//    出し直す（キーが変わると表示回数がリセットされる）。
const STORAGE_KEY = "ashiato.iconNotice.v2";

// アプリの公開URL（T-64文面修正、v1.13.1）。手順1でホーム画面のショートカットを
// 消させる以上、ホーム画面からしか入っていない利用者には戻り道が無くなる。そのため
// 手順の中にURLを文字として示す。
// 🔴 リンク（<a>）にはしない。押すとページが遷移し、このシート自体が消えてしまうため
//    （利用者から見ると「案内の続きが読めなくなる」）。
const APP_URL = "https://rfurutani.github.io/zenkoku-run/";

// 最大2回まで。1日1回まで（同じ日に2回目は出さない）。
const MAX_SHOWN = 2;

let lastFocusedEl = null;
// 開いている間だけ値を持つ。checkIconNotice()が返すPromiseを、利用者が閉じ終わった
// 後にresolveするための関数（whatsnew.jsのresolveShownと同じ考え方）。
let resolveShown = null;
let elements = null;

// ブラウザのローカル日付。利用者は全員日本のためタイムゾーン換算はしない（T-64）。
// toISOString()はUTCに変換してしまい、日本時間の朝9時より前が前日になるため使わない。
function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// localStorageが使えない環境（プライベートモード・サイトデータのブロック等）では
// getItem自体が例外を投げる。その場合はnullを返し、呼び出し側で「何も表示しない」
// を選ぶ（エラーにしない）。値が無いだけの場合は初期値を返す（＝1回目を表示する）。
function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return { shown: 0, lastDate: "" };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      shown: Number.isInteger(parsed?.shown) ? parsed.shown : 0,
      lastDate: typeof parsed?.lastDate === "string" ? parsed.lastDate : "",
    };
  } catch {
    // 壊れた値が入っていた場合は初期値として扱う（次のsaveStateで上書きされる）。
    return { shown: 0, lastDate: "" };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存できない環境では、このセッション限りの表示で終わる。利用者の操作を
    // 妨げるほどのことではないため、握りつぶす（画面にもコンソールにも出さない）。
  }
}

function buildStepList(summaryText, steps) {
  const details = document.createElement("details");

  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  details.appendChild(summary);

  const ol = document.createElement("ol");
  steps.forEach((step) => {
    const li = document.createElement("li");
    if (typeof step === "string") {
      li.textContent = step;
    } else {
      // URLつきの手順は、同じ<li>の中で改行して2行に見せる（<li>を分けると
      // 手順番号が1つずれるため）。style.cssには何も足さない方針（T-64）のまま
      // にするため、改行の有効化と長いURLの折り返しは要素のstyleに直接指定する。
      // word-breakは狭い画面でURLが枠からはみ出すのを防ぐためのもの。日本語の
      // 行はもともと任意の位置で折り返されるため、この指定による見た目の変化は無い。
      li.textContent = `${step.text}\n${step.url}`;
      li.style.whiteSpace = "pre-line";
      li.style.overflowWrap = "anywhere";
      li.style.wordBreak = "break-all";
    }
    ol.appendChild(li);
  });
  details.appendChild(ol);

  return details;
}

// 初回に1度だけDOMを組み立てる。既存のシート（index.html）と同じ構造・同じ
// クラス名にそろえてあるため、CSSの追加は不要。
function buildPanel() {
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.id = "iconNoticeScrim";

  const panel = document.createElement("div");
  panel.className = "sheet";
  panel.id = "iconNoticePanel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "iconNoticeTitle");
  panel.setAttribute("aria-hidden", "true");

  const title = document.createElement("h3");
  title.id = "iconNoticeTitle";
  title.textContent = "アイコンが新しくなりました";
  panel.appendChild(title);

  const lead = document.createElement("p");
  lead.textContent =
    "ホーム画面に ASHIATO を追加している方は、一度削除して、もう一度追加すると新しいアイコンになります。";
  panel.appendChild(lead);

  const reassurance = document.createElement("p");
  reassurance.textContent = "追加していない方は、そのままで大丈夫です。";
  panel.appendChild(reassurance);

  // 手順より前に置く。手順1でショートカットを消してしまってから読んでも手遅れになる
  // ため（この一文はその事故を防ぐためのもの）。手順は<details>で畳まれており、
  // 開かない利用者もいる。
  const urlNote = document.createElement("p");
  urlNote.textContent =
    "※ 先にこのURLをメモするか、ブラウザのお気に入りに入れてから削除してください。";
  panel.appendChild(urlNote);

  panel.appendChild(
    buildStepList("iPhone の方", [
      "ホーム画面の ASHIATO を長押し →「ブックマークを削除」",
      { text: "Safari で下のURLを開く", url: APP_URL },
      "下の共有ボタン（□に↑）→「ホーム画面に追加」",
    ])
  );

  panel.appendChild(
    buildStepList("Android の方", [
      "ホーム画面の ASHIATO を長押し →「削除」",
      { text: "Chrome で下のURLを開く", url: APP_URL },
      "右上の ⋮ →「ホーム画面に追加」",
    ])
  );

  const btnrow = document.createElement("div");
  btnrow.className = "btnrow";
  const closeButton = document.createElement("button");
  closeButton.className = "ghost";
  closeButton.id = "iconNoticeCloseButton";
  closeButton.type = "button";
  closeButton.textContent = "閉じる";
  btnrow.appendChild(closeButton);
  panel.appendChild(btnrow);

  document.body.appendChild(scrim);
  document.body.appendChild(panel);

  closeButton.addEventListener("click", closePanel);
  scrim.addEventListener("click", closePanel);

  return { scrim, panel, closeButton };
}

function openPanel() {
  if (!elements) {
    elements = buildPanel();
  }
  lastFocusedEl = document.activeElement;
  elements.panel.removeAttribute("aria-hidden");
  elements.panel.classList.add("open");
  elements.scrim.classList.add("open");
  elements.closeButton.focus();
}

function closePanel() {
  elements.panel.classList.remove("open");
  elements.scrim.classList.remove("open");
  elements.panel.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }

  // 「読んだ」とみなすのは閉じた時点（開いた瞬間だと、読む前に閉じた場合でも
  // 回数を消費してしまう。whatsnew.jsの既読化と同じ考え方）。
  const state = loadState();
  saveState({
    shown: (state?.shown ?? 0) + 1,
    lastDate: todayString(),
  });

  const resolve = resolveShown;
  resolveShown = null;
  if (resolve) {
    resolve();
  }
}

// ログイン成功後、チーム通知（T-50）・更新のお知らせ（T-57）の後にauth.jsから呼ぶ。
// それらと同じくモーダルが閉じられるまでresolveしないため、直列にawaitすれば
// 2枚のシートが同時に開くことはない。
export function checkIconNotice() {
  return new Promise((resolve) => {
    const state = loadState();

    // localStorageが使えない → 出した回数を数えられず毎回出てしまうため、出さない。
    if (state === null) {
      resolve();
      return;
    }

    if (state.shown >= MAX_SHOWN || state.lastDate === todayString()) {
      resolve();
      return;
    }

    resolveShown = resolve;
    openPanel();
  });
}
