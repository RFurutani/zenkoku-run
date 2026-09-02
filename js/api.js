import { loadIdToken } from "./token-store.js";
import { APP_VERSION } from "./version.js";

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
// X-App-Versionは、初回ログインでusers行が新規作成されるときだけ使われる
// （worker/src/auth.jsのensureUserRegistered参照。T-57：登録直後の利用者に
// 「使ったことのないアプリの更新履歴」を見せないための情報で、2回目以降の
// ログインでは無視される）。
export async function fetchMe() {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/me`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
      "X-App-Version": APP_VERSION,
    },
  });
}

// 自分のニックネームの変更（T-53、設定画面用）。空文字を送ると未設定に戻る
// （worker/src/router.jsのnormalizeNickname参照）。
export async function updateNickname(nickname) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nickname }),
  });
}

// 更新のお知らせ（T-57）を閉じたときの既読化用。design.md 4.12節：値はサーバー側で
// 検証しないため、常にversion.jsのAPP_VERSIONをそのまま渡す。
export async function updateLastSeenVersion(version) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ last_seen_version: version }),
  });
}

// mode=team用のクエリ文字列を組み立てる（T-36 M3）。modeがpersonalならteam_idは付けない。
function modeParams(mode, teamId) {
  const params = new URLSearchParams({ mode });
  if (mode === "team" && teamId !== null && teamId !== undefined) {
    params.set("team_id", teamId);
  }
  return params;
}

// 47都道府県分の制覇状況サマリー（T-14／T-36 M3でmode切替に対応）。
// 呼び出し側は既にログイン済みの前提。
export async function fetchSummary(mode = "personal", teamId = null) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/summary?${modeParams(mode, teamId)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

// 県詳細（市一覧・走行記録）（T-16／T-36 M3でmode切替に対応）。
// 呼び出し側は既にログイン済みの前提。
export async function fetchPrefDetail(prefCode, mode = "personal", teamId = null) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/pref/${prefCode}?${modeParams(mode, teamId)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

// 走行記録の登録（T-17／T-49でdistance_km追加）。bodyは
// {city_code, run_date, memo, distance_km}のスネークケースのまま渡す
// （design.md 4.2節・4.11節のAPI仕様どおり。呼び出し側でキー名を変換しない）。
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

// 走行記録の修正（T-56）。bodyは{run_date, memo, distance_km}のスネークケースのまま渡す
// （createRecordと同じ考え方）。市（city_code）はサーバー側がホワイトリストで拒否するため
// ここでは送らない（design.md 4.5節・4.13節）。
export async function updateRun(runId, body) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/runs/${runId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// 走行記録の削除（T-56）。最後の1件を削除すると対応するconquestsも削除される
// （design.md 4.5節）。
export async function deleteRun(runId) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/runs/${runId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
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

// 走行距離の可視化シート用集計（T-49、チームのみ。design.md 4.11節）。
// 月別集計・メンバー別集計を返す。個人モードの月別集計はGET /api/summaryに
// 同梱されるためこの関数は使わない（fetchSummary参照）。
export async function fetchTeamDistance(teamId) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/teams/${teamId}/distance`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

// チームの新着通知（T-50）。「その人にとって初めての制覇」だけを人ごとにまとめて返す。
export async function fetchTeamUpdates(teamId) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/teams/${teamId}/updates`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

// 通知を閉じたときに呼ぶ既読化（T-50）。last_seen_atを「今」に更新する。
export async function markTeamUpdatesSeen(teamId) {
  const idToken = loadIdToken();
  return fetch(`${API_BASE}/api/teams/${teamId}/seen`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${idToken}` },
  });
}
