// 県詳細シート（T-16）。地図のセルをタップ／Enterすると、この県の市一覧・走行記録を表示する。
// 走行記録の登録フォーム（T-17）もここに含む。
// CLAUDE.mdセキュリティ規約8：サーバー由来の文字列（県名・市名・メモ）はinnerHTMLで描画せず、
// textContentまたはcreateElementで組み立てる。

import {
  fetchPrefDetail,
  createRecord,
  fetchPhoto,
  uploadPhoto,
  deletePhoto,
  updateRun,
  deleteRun,
} from "./api.js";
import { renderSummary, getCurrentBadgeState } from "./summary.js";
import { compressImage } from "./photo.js";
import { getDisplayMode } from "./display-mode.js";

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
const fDistanceEl = document.getElementById("fDistance");
const fPublicMemoEl = document.getElementById("fPublicMemo");
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

// worker/src/router.jsのMAX_PHOTOS_PER_RUNと一致させること（design.md 4.7節）。
const MAX_PHOTOS_PER_RUN = 2;
// worker/src/router.jsのDISTANCE_KM_MIN/MAXと一致させること（design.md 4.13節、
// #recordFormのfDistanceと同じ範囲）。
const RUN_DISTANCE_MIN = 0.1;
const RUN_DISTANCE_MAX = 500;

// T-56：一覧内インライン編集で、いま展開中の走行記録ID（1件のみ）。
// design.md 4.13節：写真アップロード中フラグ（uploadingRunIds）と同じ、1状態1変数のパターン。
let editingRunId = null;

// アップロード直後のプレビューはKVから取り直さず、ここに保持したローカルBlobの
// オブジェクトURLをそのまま使い続ける（design.md 4.4節：KVは書き込み直後
// 最大60秒程度の結果整合性があるため）。シートを閉じるまで解放しない。
const localPhotoUrls = new Map(); // photoId -> objectURL
// GET /api/photos/:idで取得した分のオブジェクトURL。renderRuns()を呼ぶたびに
// 直前の分を解放してから作り直す（このMapとは寿命が異なるため別管理にする）。
let fetchedPhotoUrls = [];
// runId単位のアップロード中フラグ（二重押し防止）。
const uploadingRunIds = new Set();

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

// GET /api/photos/:idで取得したバイナリをimg/aへ反映する。アップロード直後の写真は
// localPhotoUrlsに既に入っているため、その場合はfetchせずローカルのオブジェクトURLを使う
// （design.md 4.4節）。
function attachPhotoUrl(photoId, imgEl, linkEl) {
  if (localPhotoUrls.has(photoId)) {
    const url = localPhotoUrls.get(photoId);
    imgEl.src = url;
    linkEl.href = url;
    return;
  }
  fetchPhoto(photoId)
    .then((res) => {
      if (!res.ok) {
        throw new Error("写真の取得に失敗しました");
      }
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      fetchedPhotoUrls.push(url);
      imgEl.src = url;
      linkEl.href = url;
    })
    .catch(() => {
      imgEl.alt = "写真を読み込めませんでした";
    });
}

// 写真1枚ぶんの要素（サムネイル＋別タブで原寸表示するリンク＋削除ボタン）を組み立てる。
// 削除ボタンはeditable（自分の記録）のときだけ付ける。DELETE /api/photos/:idは
// サーバー側もgetOwnedPhoto()で所有者限定のため他人の写真は消せないが（design.md
// 4.10.2節）、押しても404になるだけのボタンを見せるのはUIの不具合として直す
// （2026-08-28、他人の写真に削除ボタンが出ていた不具合の修正）。
function renderPhotoItem(run, photo, editable) {
  const wrap = document.createElement("div");
  wrap.className = "photo-item";

  const link = document.createElement("a");
  link.target = "_blank";
  link.rel = "noopener";

  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = "走行記録の写真";
  link.appendChild(img);
  wrap.appendChild(link);

  if (editable) {
    const delButton = document.createElement("button");
    delButton.type = "button";
    delButton.className = "photo-del";
    delButton.textContent = "✕";
    delButton.setAttribute("aria-label", "この写真を削除");
    delButton.addEventListener("click", () => handleDeletePhotoClick(run, photo.id, delButton));
    wrap.appendChild(delButton);
  }

  attachPhotoUrl(photo.id, img, link);
  return wrap;
}

// 「📷 撮影」「🖼 選択」の2ボタンとその隠しinput、アップロード状況表示欄を組み立てる。
// 上限（MAX_PHOTOS_PER_RUN）に達している場合はボタンを出さない。
function renderAddPhotoControls(li, run, currentCount) {
  const statusDiv = document.createElement("div");
  statusDiv.className = "photo-status";

  if (currentCount >= MAX_PHOTOS_PER_RUN) {
    li.appendChild(statusDiv);
    return;
  }

  const controls = document.createElement("div");
  controls.className = "photo-controls";

  function makeInput(useCameraCapture) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (useCameraCapture) {
      input.capture = "environment";
    }
    input.hidden = true;
    return input;
  }

  const cameraInput = makeInput(true);
  const galleryInput = makeInput(false);

  const cameraButton = document.createElement("button");
  cameraButton.type = "button";
  cameraButton.className = "photo-add-btn";
  cameraButton.textContent = "📷 撮影";
  cameraButton.addEventListener("click", () => cameraInput.click());

  const galleryButton = document.createElement("button");
  galleryButton.type = "button";
  galleryButton.className = "photo-add-btn";
  galleryButton.textContent = "🖼 選択";
  galleryButton.addEventListener("click", () => galleryInput.click());

  const buttons = [cameraButton, galleryButton];

  function onFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    // 同じファイルを選び直してもchangeが発火するよう、毎回クリアする。
    event.target.value = "";
    if (!file) {
      return;
    }
    handleAddPhoto(run, file, buttons, statusDiv);
  }

  cameraInput.addEventListener("change", onFileSelected);
  galleryInput.addEventListener("change", onFileSelected);

  controls.appendChild(cameraButton);
  controls.appendChild(cameraInput);
  controls.appendChild(galleryButton);
  controls.appendChild(galleryInput);

  li.appendChild(controls);
  li.appendChild(statusDiv);
}

// 「✦ 修正」「🗑 削除」の2ボタン（T-56）。editable（自分の記録）のときだけ
// 呼ばれる（renderPhotoItem・renderAddPhotoControlsと同じ条件、design.md 4.13節。
// 🔴 チームモードで他人の記録に出さないことがv1.6.1の教訓＝呼び出し元で
// isOwnRun !== falseを確認済みの前提）。
function renderRunActions(li, run) {
  const actions = document.createElement("div");
  actions.className = "run-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "run-edit-btn";
  editButton.textContent = "✦ 修正";
  editButton.addEventListener("click", () => {
    editingRunId = run.runId;
    renderRuns(currentPrefData.runs);
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "run-delete-btn";
  deleteButton.textContent = "🗑 削除";
  deleteButton.addEventListener("click", () => handleDeleteRunClick(run, deleteButton));

  actions.appendChild(editButton);
  actions.appendChild(deleteButton);
  li.appendChild(actions);
}

// 一覧内インライン編集フォーム（T-56、design.md 4.13節：開発者承認済みのUI）。
// 対象は run_date・distance_km・memo のみ（city_codeは対象外＝F-23）。
function renderRunEditForm(li, run) {
  const idPrefix = `runEdit-${run.runId}`;

  const cityLabel = document.createElement("div");
  cityLabel.className = "d";
  cityLabel.textContent = run.cityName;
  li.appendChild(cityLabel);

  const form = document.createElement("div");
  form.className = "run-edit-form";

  const dateLabel = document.createElement("label");
  dateLabel.htmlFor = `${idPrefix}-date`;
  dateLabel.textContent = "日付";
  const dateInput = document.createElement("input");
  dateInput.id = `${idPrefix}-date`;
  dateInput.type = "date";
  dateInput.value = run.runDate;
  dateInput.max = todayStr();

  const distLabel = document.createElement("label");
  distLabel.htmlFor = `${idPrefix}-distance`;
  distLabel.textContent = "距離（km、任意）";
  const distInput = document.createElement("input");
  distInput.id = `${idPrefix}-distance`;
  distInput.type = "number";
  distInput.inputMode = "decimal";
  distInput.min = String(RUN_DISTANCE_MIN);
  distInput.max = String(RUN_DISTANCE_MAX);
  distInput.step = "0.1";
  distInput.value = typeof run.distanceKm === "number" ? run.distanceKm : "";

  const publicMemoLabel = document.createElement("label");
  publicMemoLabel.htmlFor = `${idPrefix}-public-memo`;
  publicMemoLabel.textContent = "🌐 みんなに見せるメモ（100文字まで・任意）";
  const publicMemoInput = document.createElement("textarea");
  publicMemoInput.id = `${idPrefix}-public-memo`;
  publicMemoInput.className = "public-memo-input";
  publicMemoInput.maxLength = 100;
  publicMemoInput.value = run.publicMemo || "";

  const memoLabel = document.createElement("label");
  memoLabel.htmlFor = `${idPrefix}-memo`;
  memoLabel.textContent = "🔒 自分だけのメモ（任意）";
  const memoInput = document.createElement("textarea");
  memoInput.id = `${idPrefix}-memo`;
  memoInput.value = run.memo || "";

  const errorEl = document.createElement("p");
  errorEl.className = "run-edit-error";
  errorEl.setAttribute("role", "alert");

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "run-edit-save";
  saveButton.textContent = "保存";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "run-edit-cancel";
  cancelButton.textContent = "キャンセル";
  cancelButton.addEventListener("click", () => {
    editingRunId = null;
    renderRuns(currentPrefData.runs);
  });

  saveButton.addEventListener("click", () =>
    handleUpdateRunSubmit(
      run,
      dateInput,
      distInput,
      publicMemoInput,
      memoInput,
      errorEl,
      saveButton,
      cancelButton
    )
  );

  const btnRow = document.createElement("div");
  btnRow.className = "run-edit-actions";
  btnRow.appendChild(saveButton);
  btnRow.appendChild(cancelButton);

  form.appendChild(dateLabel);
  form.appendChild(dateInput);
  form.appendChild(distLabel);
  form.appendChild(distInput);
  form.appendChild(publicMemoLabel);
  form.appendChild(publicMemoInput);
  form.appendChild(memoLabel);
  form.appendChild(memoInput);
  form.appendChild(errorEl);
  form.appendChild(btnRow);

  li.appendChild(form);
}

// 保存（PATCH /api/runs/:id）。クライアント側の検証はサーバーと同じ範囲を先に弾くが、
// 最終判定はサーバー側（validateDistanceKm等）を正とする（design.md 4.13節）。
async function handleUpdateRunSubmit(
  run,
  dateInput,
  distInput,
  publicMemoInput,
  memoInput,
  errorEl,
  saveButton,
  cancelButton
) {
  errorEl.textContent = "";

  const runDate = dateInput.value;
  if (!runDate) {
    errorEl.textContent = "走行日を入力してください。";
    return;
  }

  const distanceInput = distInput.value.trim();
  const distanceKm = distanceInput === "" ? null : Number(distanceInput);
  if (
    distanceKm !== null &&
    (!Number.isFinite(distanceKm) || distanceKm < RUN_DISTANCE_MIN || distanceKm > RUN_DISTANCE_MAX)
  ) {
    errorEl.textContent = `距離は${RUN_DISTANCE_MIN}〜${RUN_DISTANCE_MAX}kmの範囲で入力してください。`;
    return;
  }

  const publicMemo = publicMemoInput.value.trim();
  const memo = memoInput.value.trim();

  saveButton.disabled = true;
  cancelButton.disabled = true;

  try {
    const res = await updateRun(run.runId, {
      run_date: runDate,
      memo,
      distance_km: distanceKm,
      public_memo: publicMemo,
    });

    if (res.status === 401) {
      errorEl.textContent = "セッションが切れました。再ログインしてください。";
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      errorEl.textContent =
        body?.error ?? "記録の修正に失敗しました。しばらくしてからもう一度お試しください。";
      return;
    }

    // 距離の変更は数値サマリー・可視化シート（T-49）の集計にも影響するため、
    // 登録成功時（handleRecordSubmit）と同じくpref・summaryの両方を再取得する
    // （design.md 4.13節）。
    editingRunId = null;
    const [prefOk, summaryOk] = await Promise.all([loadAndRenderPref(currentPrefCode), renderSummary()]);
    if (prefOk && summaryOk) {
      reattachTriggerAfterSummaryRerender();
    } else {
      showSheetError("修正は完了しましたが、画面の更新に失敗しました。再読み込みしてください。");
    }
  } catch {
    errorEl.textContent = "サーバーに接続できませんでした。しばらくしてからもう一度お試しください。";
  } finally {
    // renderRunsで要素が作り直された場合、このbuttonsは既にDOMから外れているため
    // disabled解除は無意味だが、上のエラー分岐（return）でDOMがそのまま残るケースでは必要
    // （handleAddPhotoの同種コメントと同じ理由）。
    saveButton.disabled = false;
    cancelButton.disabled = false;
  }
}

// F-26（削除は確認ダイアログを挟む）＋design.md 4.5節の合意：その走行記録が
// この市で最後の1件の場合は「制覇も取り消される」ことを文言で伝える。
function confirmDeleteRun(isLastForCity, cityName) {
  return window.confirm(
    isLastForCity
      ? `この記録を削除すると、${cityName}の制覇も取り消されます。削除しますか？`
      : "この記録を削除しますか？"
  );
}

async function handleDeleteRunClick(run, button) {
  if (button.disabled) {
    return;
  }

  // 判定はAPIを増やさず、フロントが既に持っているcurrentPrefData.runsから数える
  // （design.md 4.13節）。ダイアログは削除前に出す必要があるため、レスポンスの
  // conquestDeletedではなく削除前のクライアント側カウントで文言を決める。
  const isLastForCity =
    (currentPrefData?.runs ?? []).filter(
      (r) => r.cityCode === run.cityCode && r.isOwnRun !== false
    ).length <= 1;

  if (!confirmDeleteRun(isLastForCity, run.cityName)) {
    return;
  }

  button.disabled = true;
  try {
    const res = await deleteRun(run.runId);
    if (!res.ok) {
      showSheetError(
        res.status === 401
          ? "セッションが切れました。再ログインしてください。"
          : "記録の削除に失敗しました。しばらくしてからもう一度お試しください。"
      );
      button.disabled = false;
      return;
    }

    if (editingRunId === run.runId) {
      editingRunId = null;
    }
    showSheetError("");
    const [prefOk, summaryOk] = await Promise.all([loadAndRenderPref(currentPrefCode), renderSummary()]);
    if (prefOk && summaryOk) {
      reattachTriggerAfterSummaryRerender();
    } else {
      showSheetError("削除は完了しましたが、画面の更新に失敗しました。再読み込みしてください。");
    }
  } catch {
    showSheetError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
    button.disabled = false;
  }
}

function renderRuns(runs) {
  // 直前の描画でfetchした分のオブジェクトURLだけ解放する。ローカルアップロード分
  // （localPhotoUrls）はシートを閉じるまで温存する（design.md 4.4節）。
  fetchedPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  fetchedPhotoUrls = [];

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

    // isOwnRunはチームモード限定のフィールド（個人モードには無くundefined）。
    // undefined !== falseはtrueになるため、個人モードの記録は常にeditable扱いになる
    // （従来どおり自分の記録として操作できる）。
    // 🔴 チームモードでは他人の記録に修正・削除ボタンを出さない（v1.6.1で写真削除
    // ボタンが他人の写真に出ていた不具合と同じ教訓、design.md 4.13節）。
    const editable = run.isOwnRun !== false;

    if (editable && run.runId === editingRunId) {
      renderRunEditForm(li, run);
      runsEl.appendChild(li);
      return;
    }

    const dateSpan = document.createElement("span");
    dateSpan.className = "d";
    dateSpan.textContent = run.runDate;
    li.appendChild(dateSpan);
    li.appendChild(document.createTextNode(run.cityName));

    // 走行距離（T-49）。距離未入力（null）の記録も「—」で必ず表示し、空欄にしない
    // （design.md 4.11節）。
    const distSpan = document.createElement("span");
    distSpan.className = "dist";
    distSpan.textContent = typeof run.distanceKm === "number" ? `${run.distanceKm.toFixed(1)} km` : "—";
    li.appendChild(distSpan);

    // registrantNameはチームモードでのみ返る（個人モードはバックエンドがフィールド自体を
    // 省略するため、この条件だけで「個人モードでは名前を出さない」を満たす。design.md
    // 4.10.16節）。isOwnRunも同様にチームモード限定のため、自分の記録には★を付ける
    // （画面仕様③、design.md 4.10.14節）。
    if (run.registrantName) {
      const whoSpan = document.createElement("span");
      whoSpan.className = "who";
      whoSpan.textContent = run.isOwnRun ? `★ ${run.registrantName}` : run.registrantName;
      li.appendChild(whoSpan);
    }
    // 公開メモを先に、自分だけのメモは🔒を前置して後に表示する（T-59、design.md 4.14節）。
    if (run.publicMemo) {
      const publicMemoDiv = document.createElement("div");
      publicMemoDiv.className = "public-memo";
      publicMemoDiv.textContent = run.publicMemo;
      li.appendChild(publicMemoDiv);
    }
    if (run.memo) {
      const memoDiv = document.createElement("div");
      memoDiv.className = "memo";
      memoDiv.textContent = `🔒 ${run.memo}`;
      li.appendChild(memoDiv);
    }

    if (editable) {
      renderRunActions(li, run);
    }

    const photos = run.photos || [];
    if (photos.length > 0) {
      const photosDiv = document.createElement("div");
      photosDiv.className = "photos";
      photos.forEach((photo) => {
        photosDiv.appendChild(renderPhotoItem(run, photo, editable));
      });
      li.appendChild(photosDiv);
    }
    // 写真の追加もeditable（自分の記録）のときだけ。POST /api/photosはgetOwnedRun()で
    // 所有者限定のため他人の記録には追加できないが（design.md 4.5節）、UIとしても
    // 出さない（上のrenderPhotoItemと同じ理由）。
    if (editable) {
      renderAddPhotoControls(li, run, photos.length);
    }

    runsEl.appendChild(li);
  });
}

// 圧縮 → アップロード → 成功したらローカルBlobのオブジェクトURLをそのまま
// サムネイルに使う（design.md 4.4節：アップロード直後はKVを読み直さない）。
async function handleAddPhoto(run, file, buttons, statusDiv) {
  if (uploadingRunIds.has(run.runId)) {
    return;
  }

  statusDiv.textContent = "";
  statusDiv.classList.remove("error");

  let compressed;
  try {
    compressed = await compressImage(file);
  } catch {
    statusDiv.textContent = "この画像は処理できませんでした。別の写真をお試しください。";
    statusDiv.classList.add("error");
    return;
  }

  uploadingRunIds.add(run.runId);
  buttons.forEach((b) => {
    b.disabled = true;
  });
  statusDiv.textContent = "アップロード中…";

  try {
    const res = await uploadPhoto(run.runId, compressed);

    if (res.status === 401) {
      statusDiv.textContent = "セッションが切れました。再ログインしてください。";
      statusDiv.classList.add("error");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      statusDiv.textContent =
        body?.error ?? "写真の保存に失敗しました。しばらくしてからもう一度お試しください。";
      statusDiv.classList.add("error");
      return;
    }

    const data = await res.json();
    const objectUrl = URL.createObjectURL(compressed);
    localPhotoUrls.set(data.photoId, objectUrl);

    const targetRun = currentPrefData?.runs.find((r) => r.runId === run.runId);
    if (targetRun) {
      targetRun.photos = [...(targetRun.photos || []), { id: data.photoId, sortOrder: data.sortOrder }];
    }
    renderRuns(currentPrefData.runs);
  } catch {
    statusDiv.textContent = "サーバーに接続できませんでした。しばらくしてからもう一度お試しください。";
    statusDiv.classList.add("error");
  } finally {
    uploadingRunIds.delete(run.runId);
    // renderRunsで要素が作り直された場合、このbuttonsは既にDOMから外れているため
    // disabled解除は無意味だが、上のエラー分岐（return）でDOMがそのまま残るケースでは必要。
    buttons.forEach((b) => {
      b.disabled = false;
    });
  }
}

function confirmDeletePhoto() {
  return window.confirm("この写真を削除しますか？");
}

async function handleDeletePhotoClick(run, photoId, button) {
  if (button.disabled) {
    return;
  }
  if (!confirmDeletePhoto()) {
    return;
  }

  button.disabled = true;
  try {
    const res = await deletePhoto(photoId);
    if (!res.ok) {
      showSheetError(
        res.status === 401
          ? "セッションが切れました。再ログインしてください。"
          : "写真の削除に失敗しました。しばらくしてからもう一度お試しください。"
      );
      button.disabled = false;
      return;
    }

    if (localPhotoUrls.has(photoId)) {
      URL.revokeObjectURL(localPhotoUrls.get(photoId));
      localPhotoUrls.delete(photoId);
    }

    const targetRun = currentPrefData?.runs.find((r) => r.runId === run.runId);
    if (targetRun) {
      targetRun.photos = (targetRun.photos || []).filter((p) => p.id !== photoId);
    }
    showSheetError("");
    renderRuns(currentPrefData.runs);
  } catch {
    showSheetError("サーバーに接続できませんでした。しばらくしてからもう一度お試しください。");
    button.disabled = false;
  }
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
  fDistanceEl.value = "";
  fPublicMemoEl.value = "";
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
  const { mode, teamId } = getDisplayMode();

  let res;
  try {
    res = await fetchPrefDetail(prefCode, mode, teamId);
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
  editingRunId = null;
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

// タブ切替（display-mode.js）で、開いたままのシートに古いモードのデータが
// 残らないよう閉じるために使う。シートが元々閉じている状態でclosePrefSheet()を
// 呼ぶと、lastFocusedElが前回開いたときのままのため、意図せずフォーカスが
// そちらへ飛んでしまう（タブボタンをクリックしたのにフォーカスが移動する不具合）。
// そのため「開いている場合だけ閉じる」を切り出す。
export function isPrefSheetOpen() {
  return sheetEl.classList.contains("open");
}

export function closePrefSheet() {
  editingRunId = null;
  sheetEl.classList.remove("open");
  scrimEl.classList.remove("open");
  sheetEl.setAttribute("aria-hidden", "true");
  if (lastFocusedEl) {
    lastFocusedEl.focus();
  }

  // シートを閉じるタイミングで、fetch分・アップロード分の両方のオブジェクトURLを解放する。
  // 次に開いたときはlocalPhotoUrlsが空の状態から始まるため、その時点で全写真をfetchし直す
  // （KVの結果整合性の猶予は既に十分経過しているとみなせる。design.md 4.4節）。
  fetchedPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  fetchedPhotoUrls = [];
  localPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  localPhotoUrls.clear();
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
  const distanceInput = fDistanceEl.value.trim();
  const distanceKm = distanceInput === "" ? null : Number(distanceInput);
  const publicMemo = fPublicMemoEl.value.trim();
  const memo = fMemoEl.value.trim();

  if (!cityCode) {
    showFormError("市を選択してください。");
    return;
  }
  if (!runDate) {
    showFormError("走行日を入力してください。");
    return;
  }

  // isOwnRun !== falseとする（個人モードにはisOwnRunフィールド自体が無くundefinedのため）。
  // チームモードで他人の記録とcity_code・run_dateが偶然一致しても、それは自分の重複登録
  // ではないため確認ダイアログの対象にしない（画面仕様⑥、他人が先に制覇済みでも
  // 自分の記録は別として登録できる）。
  const isDuplicate = (currentPrefData?.runs ?? []).some(
    (run) => run.cityCode === cityCode && run.runDate === runDate && run.isOwnRun !== false
  );
  if (isDuplicate && !confirmDuplicateRun()) {
    return;
  }

  submitInFlight = true;
  submitButtonEl.disabled = true;

  try {
    const res = await createRecord({
      city_code: cityCode,
      run_date: runDate,
      memo,
      distance_km: distanceKm,
      public_memo: publicMemo,
    });

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
