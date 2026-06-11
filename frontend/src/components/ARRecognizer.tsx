import React, { useEffect, useRef, useState } from "react";
import { Node } from "../types";
import { api } from "../api/client";
import { loadOpenCV, MatchEngine, MatchResult } from "../utils/opencv";
import { drawQuad } from "../utils/arDraw";

interface Props {
  nodes: Node[];
  /** 現在地ノード。指定するとその地点から見える建物だけに絞り込む。null は絞り込みなし。 */
  viewpointNodeId: number | null;
}

/**
 * カメラ映像と登録済みの参照（建物）を特徴点マッチングし、認識した建物名を表示する。
 * ユーザーアプリ・管理画面の両方から使う共通コンポーネント。
 */
export const ARRecognizer: React.FC<Props> = ({ nodes, viewpointNodeId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const stopRef = useRef(false);
  const cvRef = useRef<any>(null);
  const engineRef = useRef<MatchEngine | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [cameraOn, setCameraOn] = useState(false);
  const [refCount, setRefCount] = useState(0);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [err, setErr] = useState("");

  // 参照（建物）の読み込み：現在地が変わるたびに絞り込んで再構築
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setResult(null);
      try {
        const cv = await loadOpenCV();
        if (cancelled) return;
        cvRef.current = cv;
        const full = await api.arFeatures.matchset(viewpointNodeId ?? undefined);
        if (cancelled) return;
        engineRef.current?.dispose();
        const engine = new MatchEngine(cv);
        engine.setReferences(
          full.map((f) => ({
            id: f.id,
            // 認識時に表示する「建物名」。建物ノードがあればその名前、なければ登録名
            name: f.node?.name ?? f.name,
            keypoints: JSON.parse(f.keypoints || "[]"),
            descriptors: f.descriptors || "",
            descRows: f.desc_rows,
            descCols: f.desc_cols,
            width: f.width,
            height: f.height,
          })),
        );
        engineRef.current = engine;
        setRefCount(engine.size);
        setStatus(engine.size > 0 ? "ready" : "empty");
      } catch (e: any) {
        if (!cancelled) {
          setErr(e.message);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewpointNodeId]);

  // 1 回分の認識処理。重い OpenCV 計算はメインスレッドを占有するため、
  // 計算が終わるたびに setTimeout で必ず空き時間（IDLE_MS）を作り、
  // その間にブラウザが映像描画・タップ操作を処理できるようにする（画面フリーズ防止）。
  const IDLE_MS = 350;
  const DETECT_WIDTH = 480; // 検出に使う縮小幅（小さいほど軽い）

  const tick = () => {
    if (stopRef.current) return;
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const engine = engineRef.current;

    if (video && overlay && engine && video.readyState >= 2) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        const scale = Math.min(1, DETECT_WIDTH / vw);
        const dw = Math.round(vw * scale);
        const dh = Math.round(vh * scale);
        const work = document.createElement("canvas");
        work.width = dw;
        work.height = dh;
        const wctx = work.getContext("2d")!;
        wctx.drawImage(video, 0, 0, dw, dh);
        const imageData = wctx.getImageData(0, 0, dw, dh);

        const ctx = overlay.getContext("2d");
        if (ctx) {
          overlay.width = vw;
          overlay.height = vh;
          ctx.clearRect(0, 0, vw, vh);
          let res: MatchResult | null = null;
          try {
            res = engine.match(imageData, 500);
          } catch {
            res = null;
          }
          if (res && res.quad) drawQuad(ctx, res.quad, vw / dw, vh / dh, res.name);
          setResult(res);
        }
      }
    }

    // 計算後に必ず空き時間を入れて次へ
    timerRef.current = window.setTimeout(tick, IDLE_MS);
  };

  const startCamera = async () => {
    try {
      await loadOpenCV();
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
      timerRef.current = window.setTimeout(tick, IDLE_MS);
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

  useEffect(() => () => {
    stopCamera();
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

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
              ? "準備中..."
              : status === "error"
              ? "読み込みに失敗しました"
              : "「カメラ起動」を押してください"}
          </div>
        )}

        {/* 認識した建物名を大きく表示 */}
        {cameraOn && result && (
          <div className="ar-building-name">🏛 {result.name}</div>
        )}
        {cameraOn && !result && (
          <div className="ar-building-scanning">建物を探しています…</div>
        )}
      </div>

      <div className="ar-recognizer-bar">
        {!cameraOn ? (
          <button className="btn-primary" onClick={startCamera} disabled={status === "loading"}>
            {status === "loading" ? "準備中..." : "カメラ起動"}
          </button>
        ) : (
          <button className="btn-secondary" onClick={stopCamera}>カメラ停止</button>
        )}
        <span className="ar-recognizer-status">
          {status === "empty"
            ? nodeName
              ? `「${nodeName}」から見える建物が未登録です`
              : "建物が未登録です"
            : `対象 ${refCount} 件`}
        </span>
      </div>
    </div>
  );
};
