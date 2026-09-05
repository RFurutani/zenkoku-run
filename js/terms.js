// 利用規約（.sheet/.scrim、診断画面と同じパターンを流用）。
// 参加を判断する材料になるため、診断ボタンと同じ理由でログイン前でも開けるよう
// login-screen/main-screenの外側（footer付近）に置く。
// 同意の記録は取らない（スキーマ変更を避けるため、開発者決定）。
// CLAUDE.mdセキュリティ規約8：文言は固定文字列だがinnerHTMLは使わず、textContentのみで組み立てる。

// 内容を変えたときだけ、この日付を書き換える（開発者決定）。
const LAST_UPDATED = "2026年9月";

// 各セクションは見出し＋本文ブロック（段落／箇条書き）の配列。
const SECTIONS = [
  {
    heading: "このアプリについて",
    blocks: [
      {
        type: "p",
        text: "古谷が一人で作って運用している、無償の個人アプリです。会社でもサービスでもありません。私が続けられなくなれば、そこで終わります。動かないことがあり、直せる保証はありません。",
      },
    ],
  },
  {
    heading: "対象の自治体について",
    blocks: [
      {
        type: "p",
        text: "このアプリが対象にしているのは、全国の792市と東京23区、あわせて815です。町村は含めていません。",
      },
      {
        type: "p",
        text: "この数は2026年1月1日時点のもので、その後の市町村合併は反映していません。",
      },
    ],
  },
  {
    heading: "メンバーに見えるもの",
    blocks: [
      { type: "p", text: "チームモードでは、次のものが他のメンバー全員に見えます。" },
      {
        type: "ul",
        items: ["あなたがどの市を、いつ制覇したか", "あなたのニックネーム", "あなたが登録した写真"],
      },
      { type: "p", text: "メモは2つあります。" },
      {
        type: "ul",
        items: [
          "「みんなに見せるメモ」は、チームのメンバー全員に見えます。制覇の通知にも表示されることがあります。",
          "「自分だけのメモ」は、あなただけに見えます。他のメンバーには表示されません。",
        ],
      },
      { type: "p", text: "これまでに書いたメモは、すべて「自分だけのメモ」に残っています。" },
      {
        type: "p",
        text: "写真を共有するのは、「本当にその市を走った」ことを互いに確認できるようにするためです。",
      },
    ],
  },
  {
    heading: "写真について、おねがい",
    blocks: [
      { type: "p", text: "見られて困るものは載せないでください。" },
      {
        type: "p",
        text: "意図せず写り込むものにご注意ください。自宅や職場の周辺が分かる風景、ご家族や第三者の顔、車のナンバープレート、表札など。",
      },
      { type: "p", text: "メンバーがスクリーンショットで保存することを、技術的に防ぐ手段はありません。" },
      { type: "p", text: "不適切と判断した写真は、管理者（古谷）が予告なく削除することがあります。" },
    ],
  },
  {
    heading: "データが消える可能性があります",
    blocks: [
      { type: "p", text: "いちばん大事なおねがいです。" },
      {
        type: "ul",
        items: [
          "記録が消えることがあります。大切な記録は、他にも控えを残してください",
          "復旧の仕組みはありますが、万能ではありません",
          "復旧はデータベース全体を巻き戻す方式です。誰か1人のミスで、全員の記録が同じ時点まで戻ることがあります",
          "バックアップは取った時点までしか戻せません",
          "写真は復元できない場合があります",
          "開発中のため、機能の追加に伴ってデータが失われる可能性があります",
        ],
      },
      { type: "p", text: "スマホのギャラリーから元の写真を消してしまうと、二度と戻せません。" },
    ],
  },
  {
    heading: "アカウントと個人情報",
    blocks: [
      {
        type: "ul",
        items: [
          "Googleアカウントが必要です",
          "管理者（古谷）は、参加者のメールアドレスを把握します",
          "管理者は、データベースの管理者として、すべてのデータに直接アクセスできる立場にあります。通常見ることはありませんが、技術的に見られる立場であることは正直にお伝えします",
        ],
      },
    ],
  },
  {
    heading: "メンバーの追加",
    blocks: [{ type: "p", text: "メンバーを増やすかどうかは、管理者（古谷）が判断します。チームには人数の上限があります。" }],
  },
  {
    heading: "やめたいとき",
    blocks: [
      { type: "p", text: "いつでもやめられます。管理者に一言ください。" },
      {
        type: "p",
        text: "ただし、やめた後も、あなたの制覇記録と写真は他のメンバーの画面に残ります（チームの実績として集計に含まれているためです）。",
      },
      { type: "p", text: "完全に削除してほしい場合は、その旨をお伝えください。対応します。" },
    ],
  },
  {
    heading: "サポート",
    blocks: [
      {
        type: "p",
        text: "困ったことがあれば、遠慮なく連絡してください。ただし善意の範囲です。すぐに直せないこと、直せないことがあります。",
      },
      { type: "p", text: "iPhone では未検証の部分があります。うまく動かないかもしれません。" },
      { type: "p", text: "動かないときは、フッターの「診断」を押した画面のスクリーンショットを送ってください。" },
    ],
  },
  {
    heading: "いま分かっている不便な点",
    blocks: [
      {
        type: "ul",
        items: [
          "1時間ほどでログアウトします",
          "スマホでタブを閉じると、ログインし直しになります",
          "地図は横にスクロールしないと、九州まで見えません",
          "写真は1つの記録につき2枚までです",
        ],
      },
      { type: "p", text: "順次直していく予定ですが、いつになるかはお約束できません。" },
    ],
  },
];

const termsButton = document.getElementById("termsButton");
const termsPanel = document.getElementById("termsPanel");
const termsScrim = document.getElementById("termsScrim");
const termsCloseButton = document.getElementById("termsCloseButton");
const termsUpdatedEl = document.getElementById("termsUpdated");
const termsBodyEl = document.getElementById("termsBody");

let lastFocusedEl = null;

function renderBlock(block) {
  if (block.type === "ul") {
    const ul = document.createElement("ul");
    block.items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    return ul;
  }
  const p = document.createElement("p");
  p.textContent = block.text;
  return p;
}

// 内容は固定文言のため、開くたびに作り直さず一度だけ組み立てる。
function renderTerms() {
  termsUpdatedEl.textContent = `最終更新：${LAST_UPDATED}`;
  termsBodyEl.textContent = "";
  SECTIONS.forEach((section) => {
    const heading = document.createElement("div");
    heading.className = "secttl";
    heading.textContent = section.heading;
    termsBodyEl.appendChild(heading);
    section.blocks.forEach((block) => {
      termsBodyEl.appendChild(renderBlock(block));
    });
  });
}

function openTerms() {
  lastFocusedEl = document.activeElement;
  termsPanel.removeAttribute("aria-hidden");
  termsPanel.classList.add("open");
  termsScrim.classList.add("open");
  termsCloseButton.focus();
}

function closeTerms() {
  termsPanel.classList.remove("open");
  termsScrim.classList.remove("open");
  termsPanel.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }
}

renderTerms();

termsButton?.addEventListener("click", openTerms);
termsCloseButton?.addEventListener("click", closeTerms);
termsScrim?.addEventListener("click", closeTerms);
