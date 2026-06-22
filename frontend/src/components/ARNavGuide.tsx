import React, { useEffect, useRef, useState } from "react";
import { RouteStepDetail } from "../types";
import { CompassPermission } from "../hooks/useCompass";
import { gpsBearing, mapBearing, angleDiff } from "../utils/bearing";

interface Props {
  step: RouteStepDetail;
  heading: number | null;
  permission: CompassPermission;
  onRequestPermission: () => void;
  userLat: number | null;
  userLng: number | null;
  mapNorthOffset: number;
  onClose: () => void;
}

/**
 * 純コンパス AR 道案内（360 画像を使わない方式）。
 *
 * 背面カメラのライブ映像の上に、次ノードへの進行方向を示す矢印を重ねる。
 * 目標方位の計算は CompassGuide と同一（GPS 優先・無ければマップ座標 + map_north_offset）。
 * 端末コンパス(heading)との差 angleDiff だけ矢印を回すので、
 *   差 0  → 矢印は真上（このまま進む）
 *   差 +  → 右に傾く（右へ回る）
 *   差 -  → 左に傾く（左へ回る）
 */
export const ARNavGuide: React.FC<Props> = ({
  step, heading, permission, onRequestPermission, userLat, userLng, mapNorthOffset, onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [err, setErr] = useState("");

  // 目標方位（CompassGuide と同じロジック）
  const { targetBearing, method } = (() => {
    const from = step.from_node;
    const to = step.to_node;
    if (userLat != null && userLng != null && to.lat != null && to.lng != null) {
      return { targetBearing: gpsBearing(userLat, userLng, to.lat, to.lng), method: "GPS" };
    }
    return {
      targetBearing: mapBearing(from.x, from.y, to.x, to.y, mapNorthOffset),
      method: "マップ",
    };
  })();

  // 背面カメラ起動（マウント時）。アンマウントで必ず停止する。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraOn(true);
      } catch (e: any) {
        if (!cancelled) setErr(`カメラを起動できませんでした: ${e?.message ?? e}`);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const hasHeading = heading !== null && permission === "granted";
  const diff = hasHeading ? angleDiff(targetBearing, heading!) : 0;
  const absD = Math.abs(diff);
  const status: "ok" | "warn" | "ng" = absD <= 20 ? "ok" : absD <= 60 ? "warn" : "ng";
  const label = !hasHeading
    ? "コンパス未取得"
    : absD <= 20
    ? "この方向へ進む ✓"
    : diff < 0
    ? `左へ ${Math.round(absD)}°`
    : `右へ ${Math.round(absD)}°`;

  return (
    <div className="arnav">
      <div className="arnav-camera-wrap">
        <video ref={videoRef} className="arnav-video" playsInline muted />

        <div className="arnav-overlay">
          {hasHeading ? (
            <svg
              className={`arnav-arrow arnav-${status}`}
              viewBox="0 0 100 100"
              style={{ transform: `rotate(${diff}deg)` }}
            >
              <polygon points="50,8 80,72 50,56 20,72" />
            </svg>
          ) : (
            <div className="arnav-need-compass">
              {permission === "unsupported" ? (
                <span>コンパス非対応の端末です</span>
              ) : (
                <button className="cg-enable-btn" onClick={onRequestPermission}>
                  コンパスを有効にする
                </button>
              )}
            </div>
          )}
          <div className={`arnav-label arnav-${status}-text`}>{label}</div>
        </div>

        {!cameraOn && !err && <div className="arnav-placeholder">カメラ起動中…</div>}
        {err && <div className="arnav-error">{err}</div>}
        <div className="arnav-method">{method}基準</div>
      </div>

      <button className="arnav-close" onClick={onClose}>← 画像に戻る</button>
    </div>
  );
};
