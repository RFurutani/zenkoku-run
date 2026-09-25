// 更新のお知らせ（T-57）で、どの版の文言を出すかを選ぶ処理（T-68）。
// DOMに触らない純粋な関数だけを置く。whatsnew.jsは読み込んだ瞬間にDOMを参照するため、
// Nodeで単体に確かめられるよう分けた（.steering/2026-09-25-T68-whatsnew-range/design.md 6章）。
// 文言（WHATS_NEW）は引数で受け取り、ここではimportしない。

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

// "1.10.0" → [1, 10, 0]。形式が違う値（null・空文字・"abc"・"1.2"など）はnullを返す。
export function parseVersion(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = VERSION_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// aが新しければ正、古ければ負、等しければ0を返す（Array.prototype.sortにそのまま渡せる形）。
// 文字列のまま比べると"1.10.0" < "1.9.0"と誤るため、整数の組にしてから
// MAJOR → MINOR → PATCHの順に比べる。どちらかが読めない値なら例外を投げる
// （呼び出し側で先にparseVersionで振り分けておく前提。黙って誤った順にしないため）。
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) {
    throw new TypeError(`版数として読めない値です: ${a}, ${b}`);
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

// 表示する版を新しい順に選び、[{ version, title, body, scopeChanged }, ...]で返す。
// - lastSeenVersionが読めない値（null・空文字・形式違反）：APP_VERSION以下で最も新しい1件
//   （いつから見ていないか分からないため。論点②'）
// - lastSeenVersion ≥ appVersion：0件（古い画面がキャッシュされていた場合など。論点⑤）
// - それ以外：lastSeenVersion < 版 ≤ appVersion を新しい順に最大max件（論点①）
// 0件のときは、呼び出し側で何も出さず既読化もしない。
export function selectEntries(lastSeenVersion, appVersion, whatsNew, max) {
  if (!parseVersion(appVersion)) {
    return [];
  }

  // 形式の違うキーは比較できないため候補から外す（書き間違いのキーはどの人にも出ない）。
  const candidates = Object.keys(whatsNew)
    .filter((version) => parseVersion(version) && compareVersions(version, appVersion) <= 0)
    .sort((a, b) => compareVersions(b, a));

  let selected;
  if (!parseVersion(lastSeenVersion)) {
    selected = candidates.slice(0, 1);
  } else if (compareVersions(lastSeenVersion, appVersion) >= 0) {
    selected = [];
  } else {
    selected = candidates
      .filter((version) => compareVersions(version, lastSeenVersion) > 0)
      .slice(0, max);
  }

  return selected.map((version) => ({ version, ...whatsNew[version] }));
}
