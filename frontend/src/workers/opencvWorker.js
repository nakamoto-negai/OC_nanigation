/* eslint-disable */
// OpenCV.js をワーカー内で読み込み、特徴点マッチングをメインスレッド外で実行する。
// これによりメインスレッド（UI・カメラ映像）が一切ブロックされず、画面が固まらない。
//
// メッセージ:
//   { type: 'init' }                         → OpenCV.js を読み込む → { type:'ready' } / { type:'error' }
//   { type: 'setRefs', refs: [...] }         → 参照（建物）を構築   → { type:'refsSet', count }
//   { type: 'match', buffer, width, height, seq } → 1 フレーム照合  → { type:'matchResult', seq, result }

let cvReady = false;
let refs = []; // { id, name, keypoints, desc(Mat), width, height }
let bf = null;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    init();
  } else if (msg.type === "setRefs") {
    setRefs(msg.refs);
    self.postMessage({ type: "refsSet", count: refs.length });
  } else if (msg.type === "match") {
    const result = doMatch(msg);
    self.postMessage({ type: "matchResult", seq: msg.seq, result });
  }
};

function init() {
  try {
    // docs.opencv.org は古い版を削除するため "4.x"（最新へリダイレクト）を使う
    importScripts("https://docs.opencv.org/4.x/opencv.js");
  } catch (err) {
    self.postMessage({ type: "error", message: "OpenCV.js の読み込みに失敗しました（ネットワークを確認してください）" });
    return;
  }
  const ready = () => {
    cvReady = true;
    bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
    self.postMessage({ type: "ready" });
  };
  if (typeof cv !== "undefined" && cv.Mat) ready();
  else cv["onRuntimeInitialized"] = ready;
}

function setRefs(items) {
  for (const r of refs) {
    try { r.desc.delete(); } catch (_) {}
  }
  refs = [];
  if (!cvReady) return;
  for (const it of items) {
    if (!it.descriptors || it.descRows <= 0 || it.descCols <= 0) continue;
    const bytes = base64ToUint8(it.descriptors);
    const desc = cv.matFromArray(it.descRows, it.descCols, cv.CV_8U, Array.from(bytes));
    refs.push({
      id: it.id, name: it.name, keypoints: it.keypoints,
      desc, width: it.width, height: it.height,
    });
  }
}

function doMatch(msg) {
  if (!cvReady || refs.length === 0) return null;

  const clamped = new Uint8ClampedArray(msg.buffer);
  const imageData = new ImageData(clamped, msg.width, msg.height);

  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const orb = new cv.ORB(500);
  const qkp = new cv.KeyPointVector();
  const qdesc = new cv.Mat();
  const noMask = new cv.Mat();

  let best = null;

  try {
    orb.detectAndCompute(gray, noMask, qkp, qdesc);
    if (qdesc.rows === 0) return null;

    const qpts = [];
    for (let i = 0; i < qkp.size(); i++) {
      const p = qkp.get(i).pt;
      qpts.push({ x: p.x, y: p.y });
    }

    for (const ref of refs) {
      const matches = new cv.DMatchVectorVector();
      try {
        bf.knnMatch(qdesc, ref.desc, matches, 2);

        const gq = [];
        const gt = [];
        for (let i = 0; i < matches.size(); i++) {
          const m = matches.get(i);
          if (m.size() < 2) continue;
          const d0 = m.get(0);
          const d1 = m.get(1);
          if (d0.distance < 0.75 * d1.distance) {
            gq.push(d0.queryIdx);
            gt.push(d0.trainIdx);
          }
        }

        const good = gq.length;
        if (good < 12) continue;

        let inliers = 0;
        let quad = null;
        if (good >= 4) {
          const srcArr = [];
          const dstArr = [];
          for (let i = 0; i < good; i++) {
            const rk = ref.keypoints[gt[i]];
            if (!rk) continue;
            srcArr.push(rk.x, rk.y);
            const fp = qpts[gq[i]];
            dstArr.push(fp.x, fp.y);
          }
          const n = dstArr.length / 2;
          if (n >= 4) {
            const sm = cv.matFromArray(n, 1, cv.CV_32FC2, srcArr);
            const dm = cv.matFromArray(n, 1, cv.CV_32FC2, dstArr);
            const mask = new cv.Mat();
            const H = cv.findHomography(sm, dm, cv.RANSAC, 5, mask);
            if (!H.empty()) {
              for (let i = 0; i < mask.rows; i++) inliers += mask.data[i] ? 1 : 0;
              const corners = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0, ref.width, 0, ref.width, ref.height, 0, ref.height,
              ]);
              const proj = new cv.Mat();
              cv.perspectiveTransform(corners, proj, H);
              const pd = proj.data32F;
              quad = [];
              for (let i = 0; i < 4; i++) quad.push({ x: pd[i * 2], y: pd[i * 2 + 1] });
              corners.delete();
              proj.delete();
            }
            sm.delete();
            dm.delete();
            mask.delete();
            H.delete();
          }
        }

        if (inliers >= 8 && (!best || inliers > best.inliers)) {
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

function base64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
