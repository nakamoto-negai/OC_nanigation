import React, { useCallback, useEffect, useRef, useState } from "react";
import { ARFeature } from "../types";
import { api } from "../api/client";
import { MatchResult } from "../utils/opencv";
import { drawQuad } from "../utils/arDraw";

// 認識成功時に中央から飛び散る星屑（煌びやか演出）。角度・距離・遅延・色をあらかじめ決めておく。
const SPARK_COLORS = ["#ffd54a", "#fff1a8", "#7dd3fc", "#f9a8d4", "#a7f3d0", "#ffffff"];
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const ang = (Math.PI * 2 * i) / 18 + (i % 2 ? 0.18 : 0);
  const dist = 95 + (i % 3) * 30;
  return {
    tx: `${Math.round(Math.cos(ang) * dist)}px`,
    ty: `${Math.round(Math.sin(ang) * dist)}px`,
    delay: `${(i % 5) * 45}ms`,
    color: SPARK_COLORS[i % SPARK_COLORS.length],
    size: 12 + (i % 3) * 7,
  };
});

const IDLE_MS = 250; // 1 回の照合後に挟む間隔
const DETECT_WIDTH = 480; // 照合に使う縮小幅（小さいほど軽い）

interface InFlight {
  vw: number;
  vh: number;
  dw: number;
  dh: number;
}

/**
 * カメラ映像と登録済みの参照を特徴点マッチングし、認識した対象名と
 * 簡易詳細（説明＋リンク）をカメラ下部に直接表示する。
 * 現在地による絞り込みは行わず、常に全登録対象を照合する。
 * ユーザーアプリ・管理画面の両方から使う共通コンポーネント。
 *
 * OpenCV.js の読み込み・初期化・照合はすべて Web Worker（opencvWorker.js）で行う。
 * メインスレッドはカメラ映像と UI だけを扱うため、読み込み中も画面が固まらない。
 */
export const ARRecognizer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const stopRef = useRef(false);

  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const pendingRefsRef = useRef<any[] | null>(null);
  const inFlightRef = useRef<InFlight | null>(null);
  const seqRef = useRef(0);
  // 認識結果(id)から詳細表示用の ARFeature（建物ノード付き）を引くためのマップ
  const featureMapRef = useRef<Map<number, ARFeature>>(new Map());
  // 煌びやか演出：新しい対象を認識したときだけ1回再生するためのキーと、直近認識idの記録
  const lastCelebratedIdRef = useRef<number | null>(null);
  const lostTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [cameraOn, setCameraOn] = useState(false);
  const [refCount, setRefCount] = useState(0);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [burst, setBurst] = useState(0);
  const [err, setErr] = useState("");

  // 1 フレームをワーカーへ送る。結果が返ってきたら（onmessage 内で）次フレームを予約する。
  const postFrame = useCallback(() => {
    if (stopRef.current) return;
    const worker = workerRef.current;
    const video = videoRef.current;
    if (!worker || !workerReadyRef.current || !video || video.readyState < 2) {
      timerRef.current = window.setTimeout(postFrame, IDLE_MS);
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      timerRef.current = window.setTimeout(postFrame, IDLE_MS);
      return;
    }
    const scale = Math.min(1, DETECT_WIDTH / vw);
    const dw = Math.round(vw * scale);
    const dh = Math.round(vh * scale);
    const work = document.createElement("canvas");
    work.width = dw;
    work.height = dh;
    const wctx = work.getContext("2d");
    if (!wctx) {
      timerRef.current = window.setTimeout(postFrame, IDLE_MS);
      return;
    }
    wctx.drawImage(video, 0, 0, dw, dh);
    const imageData = wctx.getImageData(0, 0, dw, dh);
    inFlightRef.current = { vw, vh, dw, dh };
    const buffer = imageData.data.buffer;
    seqRef.current += 1;
    // buffer を転送（コピーなし）してワーカーへ
    worker.postMessage(
      { type: "match", buffer, width: dw, height: dh, seq: seqRef.current },
      [buffer],
    );
  }, []);

  // ワーカーの生成・初期化（マウント時に一度だけ）
  useEffect(() => {
    console.log("[ARRecognizer] useEffect 実行 — ワーカーを生成します");
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/opencvWorker.js", import.meta.url));
      console.log("[ARRecognizer] new Worker 成功", worker);
    } catch (e: any) {
      // 生成失敗（本番でのアセット配信ミス・MIME・CSP 等）でアプリごと落とさない
      console.error("[ARRecognizer] new Worker 失敗:", e);
      setErr(`ワーカーを生成できませんでした: ${e?.message ?? e}`);
      setStatus("error");
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "ready") {
        workerReadyRef.current = true;
        if (pendingRefsRef.current) {
          worker.postMessage({ type: "setRefs", refs: pendingRefsRef.current });
          pendingRefsRef.current = null;
        }
      } else if (m.type === "refsSet") {
        setRefCount(m.count);
        setStatus(m.count > 0 ? "ready" : "empty");
      } else if (m.type === "matchResult") {
        const overlay = overlayRef.current;
        const dims = inFlightRef.current;
        if (overlay && dims) {
          const ctx = overlay.getContext("2d");
          if (ctx) {
            overlay.width = dims.vw;
            overlay.height = dims.vh;
            ctx.clearRect(0, 0, dims.vw, dims.vh);
            if (m.result && m.result.quad) {
              drawQuad(ctx, m.result.quad, dims.vw / dims.dw, dims.vh / dims.dh, m.result.name);
            }
          }
        }
        setResult(m.result ?? null);
        if (!stopRef.current) timerRef.current = window.setTimeout(postFrame, IDLE_MS);
      } else if (m.type === "error") {
        console.error("[ARRecognizer] worker error message:", m.message);
        setErr(m.message);
        setStatus("error");
      }
    };

    // ワーカー自体の読み込み・実行エラー（Vite のバンドル失敗や importScripts ブロック等）を画面に出す
    worker.onerror = (ev: ErrorEvent) => {
      // ev.message が空（クロスオリジンの "Script error."）でも ev.error には実体が残ることがある
      console.error("[ARRecognizer] worker.onerror:", ev, ev.error);
      setErr(`ワーカーエラー: ${ev.message || "不明（クロスオリジン）"} (${ev.filename}:${ev.lineno})`);
      setStatus("error");
    };
    // 構造化クローンできないメッセージ等（postMessage 失敗）も検知する
    worker.onmessageerror = (ev: MessageEvent) => {
      console.error("[ARRecognizer] worker.onmessageerror:", ev);
      setErr("ワーカーとのメッセージ受信に失敗しました");
      setStatus("error");
    };

    console.log("[ARRecognizer] init メッセージを送信します");
    worker.postMessage({ type: "init" });

    return () => {
      stopRef.current = true;
      if (timerRef.current != null) clearTimeout(timerRef.current);
      worker.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
    };
  }, [postFrame]);

  // 参照の読み込み：マウント時に全登録対象を取得する（現在地での絞り込みはしない）
  useEffect(() => {
    setStatus("loading");
    setResult(null);
    let cancelled = false;
    api.arFeatures
      .matchset()
      .then((full) => {
        if (cancelled) return;
        // 詳細表示用に id → ARFeature を保持（建物ノード/物体情報を含む）
        const fmap = new Map<number, ARFeature>();
        for (const f of full) fmap.set(f.id, f);
        featureMapRef.current = fmap;
        const refs = full.map((f) => ({
          id: f.id,
          // 認識時に表示する名前。物体名→建物ノード名→登録名 の順
          name: f.ar_object?.name ?? f.node?.name ?? f.name,
          keypoints: JSON.parse(f.keypoints || "[]"),
          descriptors: f.descriptors || "",
          descRows: f.desc_rows,
          descCols: f.desc_cols,
          width: f.width,
          height: f.height,
        }));
        if (workerReadyRef.current && workerRef.current) {
          workerRef.current.postMessage({ type: "setRefs", refs });
        } else {
          pendingRefsRef.current = refs;
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          setErr(e.message);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      stopRef.current = false;
      postFrame();
    } catch (e: any) {
      setErr(`カメラを起動できませんでした: ${e.message}`);
    }
  };

  const stopCamera = () => {
    stopRef.current = true;
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const overlay = overlayRef.current;
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
    setCameraOn(false);
    setResult(null);
  };

  // アンマウント時にカメラ停止
  useEffect(() => () => stopCamera(), []);

  // 新しい対象を認識したら煌びやか演出を1回再生する。
  // フレーム単位の一瞬の見失い（null）で連発しないよう、一定時間ロスしたときだけ再演出を許可する。
  useEffect(() => {
    const id = result?.id ?? null;
    if (id !== null) {
      if (lostTimerRef.current != null) {
        clearTimeout(lostTimerRef.current);
        lostTimerRef.current = null;
      }
      if (id !== lastCelebratedIdRef.current) {
        lastCelebratedIdRef.current = id;
        setBurst((b) => b + 1);
        try { navigator.vibrate?.(60); } catch { /* 非対応端末は無視 */ }
      }
    } else if (lostTimerRef.current == null) {
      // 1.5秒以上見失ったら、同じ対象を再び見つけたときに再演出できるようにリセット
      lostTimerRef.current = window.setTimeout(() => {
        lastCelebratedIdRef.current = null;
        lostTimerRef.current = null;
      }, 1500);
    }
  }, [result]);

  useEffect(() => () => {
    if (lostTimerRef.current != null) clearTimeout(lostTimerRef.current);
  }, []);

  // 認識結果から、カメラ下部に出す簡易詳細（名前・説明・リンク）を引く
  const matched = result ? featureMapRef.current.get(result.id) : null;
  const matchedObj = matched?.ar_object;
  const matchedNode = matched?.node;
  const detailTitle = matchedObj?.name ?? matchedNode?.name ?? result?.name ?? "";
  const detailDesc = matchedObj?.description || matchedNode?.description || "";
  const detailLink = matchedObj?.link_url || "";

  return (
    <div className="ar-recognizer">
      {err && <div className="global-error" onClick={() => setErr("")}>{err} ✕</div>}

      <div className="ar-camera-wrap">
        <video ref={videoRef} className="ar-camera-video" playsInline muted />
        <canvas ref={overlayRef} className="ar-camera-overlay" />

        {!cameraOn && (
          <div className="ar-camera-placeholder">
            {status === "loading"
              ? "準備中（OpenCVを読み込み中）..."
              : status === "error"
              ? "読み込みに失敗しました"
              : "「カメラ起動」を押してください"}
          </div>
        )}

        {cameraOn && !result && <div className="ar-building-scanning">対象を探しています…</div>}

        {/* 認識成功の瞬間に1回だけ再生する煌びやか演出（光のリング・フラッシュ・星屑） */}
        {burst > 0 && (
          <div className="ar-celebrate" key={burst}>
            <div className="ar-celebrate-flash" />
            <div className="ar-celebrate-ring" />
            <div className="ar-celebrate-ring ar-celebrate-ring2" />
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="ar-spark"
                style={{
                  ["--tx" as string]: s.tx,
                  ["--ty" as string]: s.ty,
                  ["--d" as string]: s.delay,
                  width: s.size,
                  height: s.size,
                } as React.CSSProperties}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" fill={s.color} />
                </svg>
              </span>
            ))}
          </div>
        )}

        {/* 認識したらカメラ下部に簡易詳細（説明＋リンク）を直接表示する */}
        {cameraOn && result && (
          <div className="ar-detail-bar">
            <div className="ar-detail-bar-title">{detailTitle}</div>
            {detailDesc && <p className="ar-detail-bar-desc">{detailDesc}</p>}
            {detailLink && (
              <a
                className="ar-detail-bar-link"
                href={detailLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                詳しく見る
              </a>
            )}
          </div>
        )}
      </div>

      <div className="ar-recognizer-bar">
        {!cameraOn ? (
          <button className="btn-primary" onClick={startCamera}>
            カメラ起動
          </button>
        ) : (
          <button className="btn-secondary" onClick={stopCamera}>カメラ停止</button>
        )}
        <span className="ar-recognizer-status">
          {status === "loading"
            ? "準備中..."
            : status === "empty"
            ? "認識対象が未登録です"
            : `対象 ${refCount} 件`}
        </span>
      </div>
    </div>
  );
};
