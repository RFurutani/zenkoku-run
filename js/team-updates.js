// チームの新着通知（T-63、design.md 4.17節。T-50＝4.10.9/4.10.18節の後継）。
// ログイン直後、通知が1件以上あるときだけ自動で開くモーダル（既存の.sheet/.scrim、
// 診断・設定・規約と同じパターンを流用）。モードに関係なく出す（design.md仕様⑦）。
//
// 2026-09-18（T-63）：「人ごとに1行（🏅 たろう が 松江市 ほか4市 を制覇しました）」を
// やめ、制覇1件＝カード1枚を日付順（昇順）に並べる形へ変更した。
// カードは4段：①日付（曜日つき）＋「登録」／②🏅 誰が・どの市を制覇／
// ③「初めての制覇」or「◯◯に続いて◯人目」／④公開メモ（あれば緑の縦線つき）。
// 画面に出す絵文字は🏅だけ。
//
// CLAUDE.mdセキュリティ規約8：nickname・市名・公開メモはいずれも利用者が入力した
// 文字列またはサーバーから受け取った文字列であり、textContent／createElementのみで
// 組み立てる。このファイルにinnerHTMLは1箇所も無い。

import { fetchTeamUpdates, markTeamUpdatesSeen } from "./api.js";

// 折りたたみ(A)：同じ日・同じ人のカードがこの枚数を超えたら、超過分を
// 「ほか◯市を見る」で畳む（design.md 4.17節）。全体の先頭N枚で畳む形にしないのは、
// 1人の大量登録が他の人のカードを押し出して隠してしまうため。
// 3枚にしているのは、2枚だと「ほか1市を見る」というボタンのほうが邪魔になるから。
const MAX_CARDS_PER_GROUP = 3;

// 折りたたみ(B)：カードの総数がこれを超えたら、古い側をまとめて畳む。
// 強い根拠のある数字ではなく「スマートフォンで数十回スクロールさせない」程度の目安で、
// 実運用で調整してよい（design.md 4.17節）。
const MAX_EXPANDED_CARDS = 30;

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

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
// 開いている間だけ値を持つ。checkTeamUpdates()が返すPromiseを、利用者が閉じ終わった
// 後にresolveするための関数（T-57：更新のお知らせと同時に開いて重ならないよう、
// auth.js側で「閉じるまで」を直列に待てるようにする。開かなかった場合は
// checkTeamUpdates内で即resolveするため、ここでセットされない）。
let resolveShown = null;

// カード1段目の日付見出し。"2026-09-01" → "9/1（月）登録"。
//
// 🔴 new Date("2026-09-01") のような文字列パースは使わない。区切り文字やTの有無で
// UTCともローカル時刻とも解釈されうるため（iOS Safariで事故が多い形。
// design.md 4.17節）。分解して数値でDate.UTCに渡し、getUTCDay()で曜日を得る。
// JST換算そのものはWorker側で済んでおり、ここに届く時点で既にJSTの日付である。
//
// 末尾の「登録」は、走った日ではなく登録した日であることを伝えるために付ける。
// 過去の記録をまとめて入力すると日付が「入力した日」になるため（実際に起きている）。
function formatDateLabel(isoDate) {
  const parts = String(isoDate ?? "").split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (
    parts.length !== 3 ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    // 想定外の値でも画面を止めない。受け取った値をそのまま出す。
    return String(isoDate ?? "");
  }

  const weekday = WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}（${weekday}）登録`;
}

// カード3段目の文言。memberRankがnullのときはnullを返し、段ごと出さない
// （Worker側が順位を確定できなかった場合。design.md 4.17節：黙って誤った数字を
// 出すより、出さないほうを選ぶ）。
function buildRankText(update) {
  const rank = update.memberRank;
  if (typeof rank !== "number") {
    return null;
  }
  if (rank === 1) {
    return "初めての制覇";
  }
  if (update.previousNickname) {
    return `${update.previousNickname}に続いて${rank}人目`;
  }
  // 2人目以降なのに直前の人が分からない場合は、人数だけを出す。
  return `${rank}人目`;
}

// カード1枚（＝制覇1件）。showDateがtrueのときだけ1段目を付ける
// （同じ日のカードが続く間は、先頭の1枚にだけ日付を出す）。
function renderCard(update, showDate) {
  const li = document.createElement("li");
  li.className = "tu-card";

  if (showDate) {
    const dateEl = document.createElement("div");
    dateEl.className = "tu-date";
    dateEl.textContent = formatDateLabel(update.date);
    li.appendChild(dateEl);
  }

  const titleEl = document.createElement("div");
  titleEl.className = "tu-title";
  titleEl.textContent = `🏅 ${update.nickname} が ${update.cityName} を制覇`;
  li.appendChild(titleEl);

  const rankText = buildRankText(update);
  if (rankText) {
    const rankEl = document.createElement("div");
    rankEl.className = "tu-rank";
    rankEl.textContent = rankText;
    li.appendChild(rankEl);
  }

  // 公開メモが無ければ枠ごと出さない（design.md 4.17節）。
  if (update.publicMemo) {
    const memoEl = document.createElement("div");
    memoEl.className = "public-memo";
    memoEl.textContent = update.publicMemo;
    li.appendChild(memoEl);
  }

  return li;
}

// 「ほか◯市を見る」「これより前の◯件を見る」の行。押すと対象を表示して自分は消える。
// <button>を使うので、キーボード操作とフォーカス表示（button:focus-visible）は
// 既定で効く（品質基準）。畳み直すボタンは作らない（閉じるまでの一度きりの画面で、
// 畳み直したい状況が想定できないため）。
function renderMoreRow(label, onClick) {
  const li = document.createElement("li");
  li.className = "tu-more";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  li.appendChild(button);

  return li;
}

// カードの並びをDocumentFragmentへ組み立てる。折りたたみ(A)をここで適用する。
//
// グループの単位は「連続する、同じ日・同じ人のカード」。並び替えはしない
// （昇順の時系列を崩さないため）ので、同じ人が同じ日の別の時間帯に分けて登録し、
// その間に他の人が挟まった場合は2つのグループになる。実際に問題になる
// 「一括登録」は連続して入るため、これで畳める。
//
// 戻り値のfirstDateElは、この区間で最初に出る日付見出しの要素
// （折りたたみ(B)を展開したときに、日付見出しが二重に出るのを防ぐために使う）。
function renderSegment(cards) {
  const fragment = document.createDocumentFragment();
  let previousDate = null;
  let firstDateEl = null;
  let index = 0;

  while (index < cards.length) {
    let end = index;
    while (
      end < cards.length &&
      cards[end].date === cards[index].date &&
      cards[end].nickname === cards[index].nickname
    ) {
      end += 1;
    }

    const group = [];
    for (let i = index; i < end; i += 1) {
      const showDate = cards[i].date !== previousDate;
      previousDate = cards[i].date;

      const li = renderCard(cards[i], showDate);
      if (showDate && !firstDateEl) {
        firstDateEl = li.querySelector(".tu-date");
      }
      group.push(li);
    }

    if (group.length > MAX_CARDS_PER_GROUP) {
      const hiddenCards = group.slice(MAX_CARDS_PER_GROUP);
      hiddenCards.forEach((li) => {
        li.hidden = true;
      });

      const moreRow = renderMoreRow(`ほか${hiddenCards.length}市を見る`, () => {
        hiddenCards.forEach((li) => {
          li.hidden = false;
        });
        moreRow.remove();
      });

      group.slice(0, MAX_CARDS_PER_GROUP).forEach((li) => fragment.appendChild(li));
      fragment.appendChild(moreRow);
      hiddenCards.forEach((li) => fragment.appendChild(li));
    } else {
      group.forEach((li) => fragment.appendChild(li));
    }

    index = end;
  }

  return { fragment, firstDateEl };
}

// 通知全体を描画する。updatesはWorkerから昇順（古い順）で届く。
// 折りたたみ(B)：総数がMAX_EXPANDED_CARDSを超えたら古い側を畳む。昇順表示のため
// 古い側が上に来るので、上を畳めば「最近の話」から読み始められる。
// (B)で数えるのは畳んだ後の見かけの枚数ではなく実数。畳んだものを展開したら
// いきなり長くなる、という二重の不意打ちを避けるため（design.md 4.17節）。
function renderUpdates(updates) {
  listEl.textContent = "";

  const hiddenOldCount =
    updates.length > MAX_EXPANDED_CARDS ? updates.length - MAX_EXPANDED_CARDS : 0;
  const olderCards = updates.slice(0, hiddenOldCount);
  const recentCards = updates.slice(hiddenOldCount);
  let recentFirstDateEl = null;

  if (olderCards.length > 0) {
    const moreRow = renderMoreRow(`これより前の${olderCards.length}件を見る`, () => {
      const older = renderSegment(olderCards);

      // 畳んだ境界が同じ日をまたいでいると、古い側の末尾と残り側の先頭で
      // 日付見出しが2回出る。展開した時点で下側の見出しを消す。
      const boundaryIsSameDay =
        olderCards[olderCards.length - 1].date === recentCards[0].date;
      if (boundaryIsSameDay && recentFirstDateEl) {
        recentFirstDateEl.hidden = true;
      }

      listEl.replaceChild(older.fragment, moreRow);
    });
    listEl.appendChild(moreRow);
  }

  const recent = renderSegment(recentCards);
  recentFirstDateEl = recent.firstDateEl;
  listEl.appendChild(recent.fragment);
}

function openPanel() {
  lastFocusedEl = document.activeElement;
  panel.removeAttribute("aria-hidden");
  panel.classList.add("open");
  scrim.classList.add("open");

  // 閉じるボタンはリストの下にあるため、そのままfocus()すると、カードが多いときに
  // シートが末尾までスクロールした状態で開いてしまう（T-63で最大30枚並びうる）。
  // フォーカスは移したうえで、表示は先頭のカードから始める。
  closeButton.focus({ preventScroll: true });
  panel.scrollTop = 0;
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
  // 🔴 折りたたんだままのカードも既読にする（design.md 4.17節(C)）。未読に残すと
  // 「閉じても減らない通知」になり、次回も同じカードが出て永久に消えないため。
  const teamId = openTeamId;
  openTeamId = null;
  if (teamId !== null) {
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

  const resolve = resolveShown;
  resolveShown = null;
  if (resolve) {
    resolve();
  }
}

function showFetchError(resolve) {
  openTeamId = null;
  listEl.textContent = "";
  errorEl.textContent =
    "チームの新着を取得できませんでした。しばらくしてからもう一度お試しください。";
  resolveShown = resolve;
  openPanel();
}

// ログイン直後、GET /api/meのteamsをもとにauth.jsから呼ぶ。
// チームに所属していない利用者（teamsが空）では、通知取得自体を呼ばない。
// 返すPromiseは、モーダルを開かなかった場合は即座に、開いた場合は利用者が
// 閉じ終わるまでresolveしない（T-57：更新のお知らせと同時に開かないよう、
// auth.js側で`await checkTeamUpdates(meData); await checkWhatsNew(meData);`と
// 直列に待てるようにするため）。
export function checkTeamUpdates(meData) {
  return new Promise((resolve) => {
    runCheck(meData, resolve);
  });
}

async function runCheck(meData, resolve) {
  const teams = meData?.teams ?? [];
  if (teams.length === 0) {
    resolve();
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
    showFetchError(resolve);
    return;
  }

  if (!res.ok) {
    console.error("チームの新着通知を取得できませんでした", res.status);
    showFetchError(resolve);
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error("チームの新着通知の解析に失敗しました", err);
    showFetchError(resolve);
    return;
  }

  const updates = data.updates ?? [];
  if (updates.length === 0) {
    resolve();
    return;
  }

  errorEl.textContent = "";
  renderUpdates(updates);
  openTeamId = teamId;
  resolveShown = resolve;
  openPanel();
}

closeButton?.addEventListener("click", closePanel);
scrim?.addEventListener("click", closePanel);
