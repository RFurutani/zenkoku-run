import { loadIdToken } from "./token-store.js";

// TODO(T-26): GitHub Pages公開後、デプロイ済みworkers.devのURLに置き換える。
const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8787"
    : "";

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) {
    throw new Error("設定の取得に失敗しました");
  }
  return res.json();
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
