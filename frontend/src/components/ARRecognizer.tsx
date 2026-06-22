import React, { useCallback, useEffect, useRef, useState } from "react";
import { ARFeature, Node } from "../types";
import { api } from "../api/client";
import { MatchResult } from "../utils/opencv";
import { drawQuad } from "../utils/arDraw";

interface Props {
  nodes: Node[];
  /** 現在地ノード。指定するとその地点から見える建物だけに絞り込む。null は絞り込みなし。 */
  viewpointNodeId: number | null;
}

const BASE = import.meta.env.VITE_API_URL ?? "";
const CONGESTION_LABELS = ["不明", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["#94a3b8", "#22c55e", "#f59e0b", "#ef4444"] as const;

const IDLE_MS = 250; // 1 回の照合後に挟む間隔
const DETECT_WIDTH = 480; // 照合に使う縮小幅（小さいほど軽い）

interface InFlight {
  vw: number;
  vh: number;
  dw: number;
  dh: number;
}

/**
 * カメラ映像と登録済みの参照（建物）を特徴点マッチングし、認識した建物名を表示する。
 * ユーザーアプリ・管理画面の両方から使う共通コンポーネント。
 *
 * OpenCV.js の読み込み・初期化・照合はすべて Web Worker（opencvWorker.js）で行う。
 * メインスレッドはカメラ映像と UI だけを扱うため、読み込み中も画面が固まらない。
 */
export const ARRecognizer: React.FC<Props> = ({ nodes, viewpointNodeId }) => {
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

  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [cameraOn, setCameraOn] = useState(false);
  const [refCount, setRefCount] = useState(0);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [detail, setDetail] = useState<ARFeature | null>(null);
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

  // 参照（建物）の読み込み：現在地が変わるたびに絞り込んで再構築
  useEffect(() => {
    setStatus("loading");
    setResult(null);
    let cancelled = false;
    api.arFeatures
      .matchset(viewpointNodeId ?? undefined)
      .then((full) => {
        if (cancelled) return;
        // 詳細表示用に id → ARFeature を保持（建物ノード情報を含む）
        const fmap = new Map<number, ARFeature>();
        for (const f of full) fmap.set(f.id, f);
        featureMapRef.current = fmap;
        const refs = full.map((f) => ({
          id: f.id,
          // 認識時に表示する「建物名」。建物ノードがあればその名前、なければ登録名
          name: f.node?.name ?? f.name,
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
  }, [viewpointNodeId]);

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
    setDetail(null);
  };

  // アンマウント時にカメラ停止
  useEffect(() => () => stopCamera(), []);

  const nodeName = viewpointNodeId != null ? nodes.find((n) => n.id === viewpointNodeId)?.name : null;

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

        {/* 認識した建物名を大きく表示。タップで詳細を開く */}
        {cameraOn && result && (
          <button
            className="ar-building-name"
            onClick={() => {
              const f = featureMapRef.current.get(result.id);
              if (f) setDetail(f);
            }}
          >
            🏛 {result.name} <span className="ar-building-tap">タップで詳細 ▸</span>
          </button>
        )}
        {cameraOn && !result && <div className="ar-building-scanning">建物を探しています…</div>}

        {detail && (() => {
          // 表示の優先順位: ARObject（建物以外の物体）→ Node（建物）→ 登録名
          const obj = detail.ar_object;
          const node = detail.node;
          const title = obj?.name ?? node?.name ?? detail.name;
          const imageUrl = obj?.image_url || detail.image_url;
          const description = obj?.description || node?.description || "";
          return (
            <div className="ar-detail-modal" onClick={() => setDetail(null)}>
              <div className="ar-detail-card" onClick={(e) => e.stopPropagation()}>
                <button className="ar-detail-close" onClick={() => setDetail(null)}>✕</button>
                {imageUrl && <img className="ar-detail-img" src={`${BASE}${imageUrl}`} alt="" />}
                <div className="ar-detail-body">
                  <h3 className="ar-detail-title">{title}</h3>
                  {obj?.category && (
                    <div className="ar-detail-status">
                      <span className="ar-detail-badge" style={{ background: "#6366f1" }}>
                        {obj.category}
                      </span>
                    </div>
                  )}
                  {/* 建物ノードのみ: 混雑・待ち時間（物体には無い） */}
                  {!obj && node && (node.congestion_level > 0 || node.wait_time > 0) && (
                    <div className="ar-detail-status">
                      {node.congestion_level > 0 && (
                        <span
                          className="ar-detail-badge"
                          style={{ background: CONGESTION_COLORS[node.congestion_level] ?? CONGESTION_COLORS[0] }}
                        >
                          {CONGESTION_LABELS[node.congestion_level] ?? "不明"}
                        </span>
                      )}
                      {node.wait_time > 0 && (
                        <span className="ar-detail-wait">待ち約{node.wait_time}分</span>
                      )}
                    </div>
                  )}
                  {description ? (
                    <p className="ar-detail-desc">{description}</p>
                  ) : (
                    <p className="ar-detail-desc ar-detail-empty">詳細情報は登録されていません</p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
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
            ? nodeName
              ? `「${nodeName}」から見える建物が未登録です`
              : "建物が未登録です"
            : `対象 ${refCount} 件`}
        </span>
      </div>
    </div>
  );
};
