import { loadIdToken } from "./token-store.js";

const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8787"
    : "https://zenkoku-run-api.ryo-furutani.workers.dev";

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) {
    throw new Error("設定の取得に失敗しました");
  }
  return res.json();
}

// ヘルスチェック（診断画面用）。認証不要の公開エンドポイント。
export async function fetchHealth() {
  return fetch(`${API_BASE}/api/health`);
}

// ログイン状態の判定用。200/401/403はここでは判定せず、呼び出し側に委ねる。
export async function fetchMe() {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

// 47都道府県分の制覇状況サマリー（T-14）。呼び出し側は既にログイン済みの前提。
export async function fetchSummary() {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/summary?mode=personal`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

// 県詳細（市一覧・走行記録）（T-16）。呼び出し側は既にログイン済みの前提。
export async function fetchPrefDetail(prefCode) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/pref/${prefCode}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

// 走行記録の登録（T-17）。bodyは{city_code, run_date, memo}のスネークケースのまま渡す
// （design.md 4.2節のAPI仕様どおり。呼び出し側でキー名を変換しない）。
export async function createRecord(body) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/records`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// 写真の取得（T-21）。<img src>はAuthorizationヘッダーを付けられないため、呼び出し側で
// レスポンスをBlob化しURL.createObjectURL()に変換してimg.srcへ渡す（design.md 4.4節）。
export async function fetchPhoto(photoId) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/photos/${photoId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

// 写真のアップロード（T-21）。1リクエスト1枚（design.md 4.7節）。blobは呼び出し側で
// canvas圧縮済みのJPEGを渡す想定。
export async function uploadPhoto(runId, blob) {
  const idToken = loadIdToken();
  const formData = new FormData();
  formData.append("run_id", String(runId));
  formData.append("photo", blob, "photo.jpg");
  return fetch(`${API_BASE}/api/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: formData,
  });
}

// 写真の削除（T-22）。
export async function deletePhoto(photoId) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/photos/${photoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
}
