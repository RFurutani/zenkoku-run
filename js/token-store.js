// GoogleのIDトークンをsessionStorageに保持する（design.md 2.4節）。
// タブを閉じると消える。aud（対象者）がこのアプリのクライアントIDに固定されているため、
// 万一盗まれても被害範囲はこのアプリへの最大1時間程度のなりすましに限られる。

const STORAGE_KEY = "idToken";

export function saveIdToken(idToken) {
  sessionStorage.setItem(STORAGE_KEY, idToken);
}

export function loadIdToken() {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearIdToken() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// 署名検証はしない（本当の検証はWorker側で必ず行う）。
// ここでは「サーバーに問い合わせる前に、明らかに期限切れのトークンで無駄打ちしない」
// ための画面表示用の簡易チェックだけを行う。
function decodePayload(idToken) {
  const payloadBase64 = idToken.split(".")[1];
  const payloadJson = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(payloadJson);
}

export function isExpired(idToken) {
  try {
    const payload = decodePayload(idToken);
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

// 診断画面用（新規機能案、docs/progress.md「次の方針」参照）。
// トークン本体は画面に出さず、残り有効時間（秒）だけを表示するために使う。
export function getRemainingSeconds(idToken) {
  try {
    const payload = decodePayload(idToken);
    return Math.max(0, Math.floor(payload.exp - Date.now() / 1000));
  } catch {
    return null;
  }
}
