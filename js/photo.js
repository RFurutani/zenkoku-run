// 写真の圧縮（T-21）。canvasのみで実現し外部ライブラリは使わない
// （CLAUDE.mdのビルドツール不採用方針、design.md 4.4節）。
// 長辺1280px・JPEG品質0.75を初期値とし、300KB超なら0.7→0.6→0.5と段階的に下げて再エンコードする。
// 0.5未満へは下げない（design.md 4.4節：それでも超える場合は300KB超のまま許容する）。

const LONG_SIDE_LIMIT = 1280;
const TARGET_BYTES = 300 * 1024;
const QUALITY_STEPS = [0.75, 0.7, 0.6, 0.5];

// canvas.toBlob()はコールバック形式のためPromiseでラップする。
function encodeCanvas(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function encodeWithQualitySteps(canvas) {
  let result = null;
  for (let i = 0; i < QUALITY_STEPS.length; i += 1) {
    const blob = await encodeCanvas(canvas, QUALITY_STEPS[i]);
    if (!blob) {
      // canvasが汚染されている等でtoBlob自体が失敗するケース。呼び出し側でエラー扱いにする。
      throw new Error("画像のエンコードに失敗しました");
    }
    result = blob;
    const isLastStep = i === QUALITY_STEPS.length - 1;
    if (blob.size <= TARGET_BYTES || isLastStep) {
      break;
    }
  }
  return result;
}

// fileが読み込めない形式（対応外のRAW等）の場合はImage.onerrorが発火し、この関数はreject
// で例外を返す。呼び出し側（pref-sheet.js）は、サーバーに送らずその場でエラー表示する。
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let { width, height } = img;
        const longSide = Math.max(width, height);
        if (longSide > LONG_SIDE_LIMIT) {
          const scale = LONG_SIDE_LIMIT / longSide;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        encodeWithQualitySteps(canvas).then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした"));
    };

    img.src = objectUrl;
  });
}
