import React, { useEffect, useRef, useState } from "react";
import { RouteStepDetail } from "../types";
import { CompassPermission } from "../hooks/useCompass";
import { gpsBearing, mapBearing, angleDiff } from "../utils/bearing";
import { GoalPhotoGallery } from "./GoalPhotoGallery";

interface Props {
  step: RouteStepDetail;
  heading: number | null;
  permission: CompassPermission;
  onRequestPermission: () => void;
  userLat: number | null;
  userLng: number | null;
  mapNorthOffset: number;
  onClose: () => void;
  /** カメラ左上ボタンの文言。既定は「画像案内に戻る」。ホーム埋め込み時は「案内をやめる」等に差し替える。 */
  closeLabel?: string;
  /** 「次に進む」: 次のカードへ遷移する。 */
  onNext: () => void;
  /** 位置情報で次のチェックポイントに到達したか。true の間カメラに「到着しました」を表示する。 */
  arrived?: boolean;
  /** 目的ノードまでの距離(m)。GPS が無ければ null。近づくと「到着まで◯m」を表示する。 */
  distance?: number | null;
  /** 「到着地点を確認する」ボタンが押されたとき（ログ記録などに使う）。 */
  onConfirmArrival?: () => void;
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
  step, heading, permission, onRequestPermission, userLat, userLng, mapNorthOffset, onClose, closeLabel = "画像案内に変更", onNext, arrived = false, distance = null, onConfirmArrival,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [err, setErr] = useState("");
  // 「到着地点を確認する」で、到着地点(終着ノード)の登録写真をオーバーレイ表示するか
  const [showArrival, setShowArrival] = useState(false);

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

  // 矢印は React の再描画を経由せず、requestAnimationFrame で SVG の transform を
  // 直接書き換える（受信→描画の経路を最短化）。目標角(diff)へ毎フレーム最短方向に
  // 少しずつ寄せるので、センサーのノイズやイベント間隔に左右されず滑らかに動く。
  const arrowRef = useRef<SVGSVGElement>(null);
  const targetDiffRef = useRef(0); // 目標角（最新の diff）
  const dispDiffRef = useRef(0);   // 現在表示している角（連続値）
  useEffect(() => { targetDiffRef.current = diff; }, [diff]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // 表示角 → 目標角 への最短差分 [-180,180]（真後ろでの反転もこれで最短方向に回る）
      const delta = ((targetDiffRef.current - dispDiffRef.current + 540) % 360) - 180;
      // 残差が十分小さければスナップして無駄な微小更新を止める
      dispDiffRef.current += Math.abs(delta) < 0.1 ? delta : delta * 0.25;
      if (arrowRef.current) {
        arrowRef.current.style.transform = `rotate(${dispDiffRef.current}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
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

        {/* カメラ上部の操作バー: 画像案内へ戻る / 到着地点を確認する */}
        <div className="arnav-topbar">
          <button className="arnav-top-btn arnav-top-switch" onClick={onClose}>{closeLabel}</button>
          <button
            className="arnav-top-btn arnav-top-confirm"
            onClick={() => { setShowArrival(true); onConfirmArrival?.(); }}
          >
            到着地点を確認する
          </button>
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
              ref={arrowRef}
              className={`arnav-arrow arnav-${status}`}
              viewBox="0 0 100 100"
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

        {/* ボタンを押したら、到着地点の登録写真をオーバーレイ表示する */}
        {showArrival && (
          <div className="arnav-arrival-view">
            <div className="arnav-arrival-head">
              <span className="arnav-arrival-name">{step.to_node.name}</span>
              <button
                className="arnav-arrival-close"
                onClick={() => setShowArrival(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="arnav-arrival-scroll">
              <GoalPhotoGallery
                nodeId={step.to_node.id}
                initialPhotos={step.to_node.photos}
                emptyText="この地点の写真はまだ登録されていません"
              />
            </div>
          </div>
        )}

        {!cameraOn && !err && <div className="arnav-placeholder">カメラ起動中…</div>}
        {err && <div className="arnav-error">{err}</div>}
        <div className="arnav-method">{method}基準</div>
      </div>
    </div>
  );
};
