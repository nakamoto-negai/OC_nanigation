// OpenCV.js（コンピュータビジョンライブラリ）を CDN から遅延ロードするヘルパー。
//
// バンドルに含めると ~9MB と巨大になるため、AR特徴点タブを開いたときだけ
// <script> を注入して読み込む。読み込み後はグローバル `cv` が使える。
//
// ORB（Oriented FAST and Rotated BRIEF）= 特徴点検出＋バイナリ記述子。
// 検出した特徴点（keypoints）と記述子（descriptors）は、後段の
// 特徴点マッチング（平面認識・空間幾何）でカメラ映像と参照を突き合わせるのに使う。

const OPENCV_URL = "https://docs.opencv.org/4.10.0/opencv.js";

declare global {
  // eslint-disable-next-line no-var
  var cv: any;
}

let loadPromise: Promise<any> | null = null;

/** OpenCV.js を一度だけ読み込み、ランタイム初期化完了後に `cv` を返す。 */
export function loadOpenCV(): Promise<any> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // すでに読み込み済み（HMR 等）
    if (typeof window.cv !== "undefined" && window.cv?.Mat) {
      resolve(window.cv);
      return;
    }

    const existing = document.getElementById("opencv-js") as HTMLScriptElement | null;

    const onReady = () => {
      // cv はモジュールとして読み込まれ、WASM 初期化後に onRuntimeInitialized が走る
      const cv = window.cv;
      if (!cv) {
        reject(new Error("OpenCV の読み込みに失敗しました"));
        return;
      }
      if (cv.Mat) {
        resolve(cv);
      } else {
        cv.onRuntimeInitialized = () => resolve(cv);
      }
    };

    if (existing) {
      onReady();
      return;
    }

    const script = document.createElement("script");
    script.id = "opencv-js";
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error("OpenCV.js のダウンロードに失敗しました（ネットワークを確認してください）"));
    document.body.appendChild(script);
  });

  return loadPromise;
}

export interface Keypoint {
  x: number;
  y: number;
  size: number;
  angle: number;
  response: number;
  octave: number;
}

export interface DetectResult {
  keypoints: Keypoint[];
  /** ORB 記述子（CV_8U, rows×cols）を base64 化したもの。なければ空文字。 */
  descriptors: string;
  descRows: number;
  descCols: number;
}

/**
 * canvas の現在の内容から ORB 特徴点を検出する。
 * @param maxFeatures 検出する最大特徴点数
 * @param withDescriptors 記述子も計算して base64 で返すか（プレビューでは false で軽量化）
 */
export function detectORB(
  cv: any,
  canvas: HTMLCanvasElement,
  maxFeatures = 500,
  withDescriptors = false,
): DetectResult {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const orb = new cv.ORB(maxFeatures);
  const kpVec = new cv.KeyPointVector();
  const descMat = new cv.Mat();
  const noMask = new cv.Mat();

  try {
    if (withDescriptors) {
      orb.detectAndCompute(gray, noMask, kpVec, descMat);
    } else {
      orb.detect(gray, kpVec);
    }

    const keypoints: Keypoint[] = [];
    for (let i = 0; i < kpVec.size(); i++) {
      const kp = kpVec.get(i);
      keypoints.push({
        x: kp.pt.x,
        y: kp.pt.y,
        size: kp.size,
        angle: kp.angle,
        response: kp.response,
        octave: kp.octave,
      });
    }

    let descriptors = "";
    let descRows = 0;
    let descCols = 0;
    if (withDescriptors && descMat.rows > 0) {
      descRows = descMat.rows;
      descCols = descMat.cols;
      const bytes: Uint8Array = descMat.data; // CV_8U の連続バイト
      descriptors = uint8ToBase64(bytes);
    }

    return { keypoints, descriptors, descRows, descCols };
  } finally {
    src.delete();
    gray.delete();
    orb.delete();
    kpVec.delete();
    descMat.delete();
    noMask.delete();
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ── 特徴点マッチング ───────────────────────────────────────────────────────────

export interface ReferenceInput {
  id: number;
  name: string;
  keypoints: Keypoint[];
  descriptors: string; // base64 (CV_8U, descRows×descCols)
  descRows: number;
  descCols: number;
  width: number;
  height: number;
}

export interface MatchResult {
  id: number;
  name: string;
  good: number;    // 比率テストを通過した対応点数
  inliers: number; // ホモグラフィの内点数（幾何的に整合した点）
  /** フレーム座標系での参照画像の四隅（認識した対象の位置）。検出できなければ null */
  quad: { x: number; y: number }[] | null;
}

interface RefEntry {
  id: number;
  name: string;
  keypoints: Keypoint[];
  desc: any; // cv.Mat（CV_8U）
  width: number;
  height: number;
}

/**
 * 登録済みの参照特徴点を保持し、カメラフレームと照合するエンジン。
 *
 * 流れ:
 *   1. フレームから ORB 特徴点＋記述子を検出
 *   2. 各参照と BFMatcher(Hamming) で knnMatch → Lowe の比率テストで良い対応点を抽出
 *   3. 対応点が十分なら findHomography(RANSAC) で幾何検証し、内点数と対象の四隅を算出
 *   4. 内点数が最大の参照を認識結果として返す
 *
 * OpenCV.js は Mat を手動で解放する必要があるため、参照 Mat は一度だけ構築して保持し、
 * dispose() でまとめて解放する。
 */
export class MatchEngine {
  private cv: any;
  private refs: RefEntry[] = [];
  private bf: any;

  constructor(cv: any) {
    this.cv = cv;
    this.bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  }

  get size(): number {
    return this.refs.length;
  }

  setReferences(items: ReferenceInput[]) {
    this.disposeRefs();
    const cv = this.cv;
    for (const it of items) {
      if (!it.descriptors || it.descRows <= 0 || it.descCols <= 0) continue;
      const bytes = base64ToUint8(it.descriptors);
      const desc = cv.matFromArray(it.descRows, it.descCols, cv.CV_8U, Array.from(bytes));
      this.refs.push({
        id: it.id, name: it.name, keypoints: it.keypoints,
        desc, width: it.width, height: it.height,
      });
    }
  }

  match(
    frameCanvas: HTMLCanvasElement,
    maxFeatures = 800,
    minGood = 12,
    minInliers = 8,
  ): MatchResult | null {
    const cv = this.cv;
    if (this.refs.length === 0) return null;

    const src = cv.imread(frameCanvas);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const orb = new cv.ORB(maxFeatures);
    const qkp = new cv.KeyPointVector();
    const qdesc = new cv.Mat();
    const noMask = new cv.Mat();

    let best: MatchResult | null = null;

    try {
      orb.detectAndCompute(gray, noMask, qkp, qdesc);
      if (qdesc.rows === 0) return null;

      const qpts: { x: number; y: number }[] = [];
      for (let i = 0; i < qkp.size(); i++) {
        const p = qkp.get(i).pt;
        qpts.push({ x: p.x, y: p.y });
      }

      for (const ref of this.refs) {
        const matches = new cv.DMatchVectorVector();
        try {
          this.bf.knnMatch(qdesc, ref.desc, matches, 2);

          const goodQ: number[] = [];
          const goodT: number[] = [];
          for (let i = 0; i < matches.size(); i++) {
            const m = matches.get(i);
            if (m.size() < 2) continue;
            const d0 = m.get(0);
            const d1 = m.get(1);
            if (d0.distance < 0.75 * d1.distance) {
              goodQ.push(d0.queryIdx);
              goodT.push(d0.trainIdx);
            }
          }

          const good = goodQ.length;
          if (good < minGood) continue;

          let inliers = 0;
          let quad: { x: number; y: number }[] | null = null;

          if (good >= 4) {
            const srcArr: number[] = []; // 参照側の点
            const dstArr: number[] = []; // フレーム側の点
            for (let i = 0; i < good; i++) {
              const rk = ref.keypoints[goodT[i]];
              if (!rk) continue;
              srcArr.push(rk.x, rk.y);
              const fp = qpts[goodQ[i]];
              dstArr.push(fp.x, fp.y);
            }
            const n = dstArr.length / 2;
            if (n >= 4) {
              const srcMat = cv.matFromArray(n, 1, cv.CV_32FC2, srcArr);
              const dstMat = cv.matFromArray(n, 1, cv.CV_32FC2, dstArr);
              const mask = new cv.Mat();
              const H = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5, mask);
              if (!H.empty()) {
                for (let i = 0; i < mask.rows; i++) inliers += mask.data[i] ? 1 : 0;
                const corners = cv.matFromArray(4, 1, cv.CV_32FC2, [
                  0, 0, ref.width, 0, ref.width, ref.height, 0, ref.height,
                ]);
                const projected = new cv.Mat();
                cv.perspectiveTransform(corners, projected, H);
                // CV_32FC2（2チャンネル）なので data32F を [x0,y0,x1,y1,...] として直接読む
                const pd: Float32Array = projected.data32F;
                quad = [];
                for (let i = 0; i < 4; i++) {
                  quad.push({ x: pd[i * 2], y: pd[i * 2 + 1] });
                }
                corners.delete();
                projected.delete();
              }
              srcMat.delete();
              dstMat.delete();
              mask.delete();
              H.delete();
            }
          }

          if (inliers >= minInliers && (!best || inliers > best.inliers)) {
            best = { id: ref.id, name: ref.name, good, inliers, quad };
          }
        } finally {
          matches.delete();
        }
      }

      return best;
    } finally {
      src.delete();
      gray.delete();
      orb.delete();
      qkp.delete();
      qdesc.delete();
      noMask.delete();
    }
  }

  private disposeRefs() {
    for (const r of this.refs) {
      try { r.desc.delete(); } catch { /* noop */ }
    }
    this.refs = [];
  }

  dispose() {
    this.disposeRefs();
    try { this.bf.delete(); } catch { /* noop */ }
  }
}
