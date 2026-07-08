import React, { useEffect, useRef, useState } from "react";
import { RouteStepDetail } from "../types";
import { CompassPermission } from "../hooks/useCompass";
import { gpsBearing, mapBearing, angleDiff, gpsDistance } from "../utils/bearing";

interface Props {
  step: RouteStepDetail;
  heading: number | null;
  permission: CompassPermission;
  onRequestPermission: () => void;
  userLat: number | null;
  userLng: number | null;
  mapNorthOffset: number;
  onClose: () => void;
  /** 「次に進む」: 次のカードへ遷移する。 */
  onNext: () => void;
  /** 位置情報で次のチェックポイントに到達したか。true の間カメラに「到着しました」を表示する。 */
  arrived?: boolean;
  /** 目的ノードまでの距離(m)。GPS が無ければ null。近づくと「到着まで◯m」を表示する。 */
  distance?: number | null;
}

// 目的ノードまでこの距離(m)以内に近づいたら「到着まで◯m」のカウントダウンを表示する
const APPROACH_DISPLAY_M = 10;

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
  step, heading, permission, onRequestPermission, userLat, userLng, mapNorthOffset, onClose, onNext, arrived = false, distance = null,
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

  // 矢印の回転は連続値（アンラップ）で保持する。
  // diff は [-180,180] に折り返されるため、目標がほぼ真後ろのとき +179°⇄-179° と反転すると
  // CSS transition が 358° 逆回りしてしまい、一瞬だけ文字の角度表示と正反対を向いてしまう。
  // 直前の連続回転値からの最短差分だけを足し込むことで、常に最短方向へ回しつつ
  // 360° の剰余は diff（＝文字表示）と一致させる。
  const [arrowRot, setArrowRot] = useState(0);
  useEffect(() => {
    if (!hasHeading) return;
    setArrowRot((prev) => prev + angleDiff(diff, ((prev % 360) + 360) % 360));
  }, [diff, hasHeading]);
  // このカード（出発ノード→終着ノード）の進捗。区間の全長に対する到達割合を 0〜1 で表す。
  // 全長 = 出発ノードと終着ノードの GPS 距離、残り = distance（終着ノードまでの距離）。
  // GPS が無い（distance が null / 座標欠落）ときは進捗を出さない（null）。
  const from = step.from_node;
  const to = step.to_node;
  let progress: number | null = null;
  if (arrived) {
    progress = 1;
  } else if (distance != null && from.lat != null && from.lng != null && to.lat != null && to.lng != null) {
    const total = gpsDistance(from.lat, from.lng, to.lat, to.lng);
    progress = total > 0 ? Math.min(1, Math.max(0, (total - distance) / total)) : (distance <= 2 ? 1 : 0);
  }
  const progressPct = (progress ?? 0) * 100;

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
      {/* touch-action: pan-y で、カメラ上を縦スワイプしたとき道案内が普通にスクロールできるようにする */}
      <div className="arnav-camera-wrap" style={{ touchAction: "pan-y" }}>
        <video ref={videoRef} className="arnav-video" playsInline muted />

        {/* カメラ上部の操作バー: 画像案内へ戻る / 次に進む */}
        <div className="arnav-topbar">
          <button className="arnav-top-btn arnav-top-switch" onClick={onClose}>画像案内に戻る</button>
          <button className="arnav-top-btn arnav-top-next" onClick={onNext}>次に進む →</button>
        </div>

        {/* このカードの出発点→終着点を結ぶ進捗バー */}
        <div className="arnav-progress">
          <div className="arnav-progress-labels">
            <span className="arnav-progress-name">{from.name}</span>
            <span className="arnav-progress-name arnav-progress-name-to">{to.name}</span>
          </div>
          <div className="arnav-progress-track">
            <div className="arnav-progress-fill" style={{ width: `${progressPct}%` }} />
            <span className="arnav-progress-dot arnav-progress-dot-start" />
            <span className="arnav-progress-dot arnav-progress-dot-end" />
            {progress != null && (
              <span className="arnav-progress-walker" style={{ left: `${progressPct}%` }} />
            )}
          </div>
        </div>

        {/* 位置情報で到着したらカメラ全面に「到着しました」を表示 */}
        {arrived && (
          <div className="arnav-arrived">
            <span className="arnav-arrived-check">✓</span>
            <span className="arnav-arrived-text">到着しました</span>
            <span className="arnav-arrived-sub">{step.to_node.name}</span>
          </div>
        )}

        {/* 到着直前（APPROACH_DISPLAY_M 以内）は残り距離を表示する */}
        {!arrived && distance != null && distance <= APPROACH_DISPLAY_M && (
          <div className="arnav-distance">
            到着まで 約{Math.max(1, Math.ceil(distance))}m
          </div>
        )}

        <div className="arnav-overlay">
          {hasHeading ? (
            <svg
              className={`arnav-arrow arnav-${status}`}
              viewBox="0 0 100 100"
              style={{ transform: `rotate(${arrowRot}deg)` }}
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
    </div>
  );
};
