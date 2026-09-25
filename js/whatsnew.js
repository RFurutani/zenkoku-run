// 更新のお知らせ（T-57）。新しい版で初めてログインしたときだけ、まだ見ていない版の
// お知らせを1回だけ自動で開くモーダル（既存の.sheet/.scrim、チーム通知に続く7回目の流用）。
// 複数バージョンをまたいでログインが空いた場合は、見ていない版を新しい順に最大3件まとめて出す
// （T-68で「最新版1件だけ」から改定。design.md 4.12節。どの版を出すかはwhatsnew-select.js）。
// CLAUDE.mdセキュリティ規約8：文言は固定テキストのみを扱うためtextContentで組み立てる。
//
// 🔴利用規約（terms.js）とは別物。規約は「変わらない約束事」、こちらは「毎回変わる中身」
// であり、文言はdocs/CHANGELOG.md（開発者向け）とも分ける（design.md 4.12節）。

import { APP_VERSION } from "./version.js";
import { updateLastSeenVersion } from "./api.js";
import { selectEntries } from "./whatsnew-select.js";

// 一度に出す版の上限（T-68 論点①、RYO承認済み 2026-09-25）。
const MAX_ENTRIES = 3;

// 版ごとの利用者向け文言。ここに1箇所だけ集約する（version.jsがAPP_VERSIONの
// 置き場所を1箇所に集約しているのと同じ考え方）。scopeChanged: trueの版だけ、
// 「利用規約もご確認ください」の一文を併せて表示する（design.md 4.12節）。
const WHATS_NEW = {
  "1.8.0": {
    title: "v1.8.0 で増えたこと",
    body: [
      "記録するときに「距離（km）」を入力できるようになりました（わからないときは空欄のままでOKです）",
      "数値サマリーの「走行」をタップすると、月別のグラフや「日本縦断のうち何%走ったか」、チームのメンバー別の合計が見られます",
      "アップデートのお知らせを、この画面に表示するようにしました（今後の更新は、ここで確認できます）",
    ],
    scopeChanged: false,
  },
  "1.9.0": {
    title: "v1.9.0 で増えたこと",
    body: [
      "登録した記録を、あとから直せるようになりました（日付・メモ・距離。市は変えられません）",
      "記録を削除できるようになりました",
    ],
    scopeChanged: false,
  },
  "1.9.1": {
    title: "v1.9.1 で変わったこと",
    body: [
      "チームを見るときに、ニックネームの設定が必要になりました（設定していない方は、チームタブを押すと設定画面が開きます）",
    ],
    scopeChanged: false,
  },
  "1.10.0": {
    title: "v1.10.0 で増えたこと",
    body: [
      "メモが2つになりました。「みんなに見せるメモ」は、チームのみんなに見えます。「自分だけのメモ」は、これまでどおりあなただけです",
      "これまでに書いたメモは、すべて「自分だけのメモ」に残っています",
      "制覇のお知らせにも、みんなに見せるメモが出るようになりました",
      "都道府県の表示を修正しました（「北海道県」などと出ていました）",
    ],
    scopeChanged: true,
  },
  "1.12.0": {
    title: "v1.12.0 で変わったこと",
    body: [
      "チームの更新のお知らせが、制覇1つにつき1枚のカードになり、日付順に並ぶようになりました",
      "それぞれに「初めての制覇」または「◯◯さんに続いて◯人目」が出るようになりました",
      "みんなに見せるメモも、お知らせの中に表示されるようになりました",
      "一度にたくさん制覇したときは、まとめて折りたたんで表示します",
    ],
    scopeChanged: false,
  },
  "1.13.0": {
    title: "v1.13.0 で変わったこと",
    body: [
      "アプリのアイコンができました。ブラウザのタブや、ホーム画面に追加したときに足あとのマークが出ます",
      "アプリの名前を「ASHIATO」に統一しました（「全国制覇ラン」は説明として残しています）",
      "ホーム画面に追加している方は、一度削除して、もう一度追加すると新しいアイコンになります",
    ],
    scopeChanged: false,
  },
  // 1.13.0とほぼ同じ内容を書き写している。checkWhatsNew()はAPP_VERSIONと完全一致する
  // キーしか見ないため（下記参照）、1.13.0の公開30分後に1.13.1を出した今回の場合、
  // 1.13.0の文言が誰にも表示されないまま消えてしまうため（T-68）。
  "1.13.1": {
    title: "v1.13.1 で変わったこと",
    body: [
      "アプリのアイコンができました。ブラウザのタブや、ホーム画面に追加したときに足あとのマークが出ます",
      "アプリの名前を「ASHIATO」に統一しました（「全国制覇ラン」は説明として残しています）",
      "ホーム画面に追加している方は、一度削除して、もう一度追加すると新しいアイコンになります",
    ],
    scopeChanged: false,
  },
  // 1.13.1とほぼ同じ内容を書き写している。9/20以降ログインしていない人にも
  // アイコン変更を伝える手段を残すため（T-64のポップ削除に伴う代替、T-68）。
  "1.14.0": {
    title: "v1.14.0 で変わったこと",
    body: [
      "アプリのアイコンができました。ブラウザのタブや、ホーム画面に追加したときに足あとのマークが出ます",
      "アプリの名前を「ASHIATO」に統一しました（「全国制覇ラン」は説明として残しています）",
      "ホーム画面に追加している方は、一度削除して、もう一度追加すると新しいアイコンになります",
    ],
    scopeChanged: false,
  },
};

const panel = document.getElementById("whatsNewPanel");
const scrim = document.getElementById("whatsNewScrim");
const closeButton = document.getElementById("whatsNewCloseButton");
const titleEl = document.getElementById("whatsNewTitle");
const bodyEl = document.getElementById("whatsNewBody");
const termsHintEl = document.getElementById("whatsNewTermsHint");

let lastFocusedEl = null;
// 開いている間だけ値を持つ。checkWhatsNew()が返すPromiseを、利用者が閉じ終わった
// 後にresolveするための関数（team-updates.jsのresolveShownと同じ考え方）。
let resolveShown = null;

function renderLine(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

// 複数の版をまとめて出すときの、版ごとの小見出し（各版のtitle）。入れ子の<ul>にすると
// ブラウザ既定の左余白が付きstyle.cssの変更が要るため、平らな<li>の中に<strong>で置く
// （.steering/2026-09-25-T68-whatsnew-range/design.md 5章）。
function renderHeading(text) {
  const li = document.createElement("li");
  const strong = document.createElement("strong");
  strong.textContent = text;
  li.appendChild(strong);
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

  // 閉じたときにlast_seen_versionを更新する（開いた瞬間だと、読む前に閉じた場合に
  // 既読化されず、次回ログインでもう一度出てしまう。T-50・design.md仕様⑤と同じ考え方）。
  try {
    const res = await updateLastSeenVersion(APP_VERSION);
    if (!res.ok) {
      // 既読化の失敗は利用者の操作を妨げるほどではないため、コンソールにだけ残す
      // （次回ログイン時にもう一度同じお知らせが出るだけで実害は小さい）。
      console.error("更新のお知らせの既読化に失敗しました", res.status);
    }
  } catch (err) {
    console.error("更新のお知らせの既読化に失敗しました", err);
  }

  const resolve = resolveShown;
  resolveShown = null;
  if (resolve) {
    resolve();
  }
}

// ログイン直後、GET /api/meのlastSeenVersionをもとにauth.jsから呼ぶ。
// チーム通知（checkTeamUpdates）の後に呼ぶことで、2枚のシートが同時に開くのを防ぐ
// （T-57、auth.jsのcheckLoginState参照）。
export function checkWhatsNew(meData) {
  return new Promise((resolve) => {
    const entries = selectEntries(meData?.lastSeenVersion, APP_VERSION, WHATS_NEW, MAX_ENTRIES);
    if (entries.length === 0) {
      // 見た版が今の版以上、または見ていない範囲に文言が1つも無い。お知らせを
      // 出せないため、既読化もせず黙って進む（次に文言が登録された版で改めて出る）。
      resolve();
      return;
    }

    bodyEl.textContent = "";
    if (entries.length === 1) {
      // 1件のときは従来どおり、その版のtitleを見出しにする（論点④）。
      titleEl.textContent = entries[0].title;
      entries[0].body.forEach((line) => bodyEl.appendChild(renderLine(line)));
    } else {
      titleEl.textContent = "前回からの更新";
      entries.forEach((entry) => {
        bodyEl.appendChild(renderHeading(entry.title));
        entry.body.forEach((line) => bodyEl.appendChild(renderLine(line)));
      });
    }
    // 表示する版のうち1つでも共有範囲が変わっていれば、一文を1回だけ出す。
    termsHintEl.textContent = entries.some((entry) => entry.scopeChanged)
      ? "共有範囲が変わりました。利用規約もご確認ください。"
      : "";

    resolveShown = resolve;
    openPanel();
  });
}

closeButton?.addEventListener("click", closePanel);
scrim?.addEventListener("click", closePanel);
