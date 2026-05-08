import React from "react";
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
}

const TICKS = Array.from({ length: 36 }, (_, i) => {
  const deg = i * 10;
  const rad = (deg * Math.PI) / 180;
  const isMajor = deg % 90 === 0;
  const r1 = isMajor ? 60 : deg % 30 === 0 ? 64 : 67;
  return { deg, rad, isMajor, r1 };
});

export const CompassGuide: React.FC<Props> = ({
  step, heading, permission, onRequestPermission, userLat, userLng, mapNorthOffset,
}) => {
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

  if (permission === "unsupported") {
    return <p className="cg-msg">コンパス非対応デバイス</p>;
  }
  if (permission === "denied") {
    return <p className="cg-msg">コンパスが拒否されました</p>;
  }
  if (permission === "prompt") {
    return (
      <div className="cg-prompt">
        <button className="cg-enable-btn" onClick={onRequestPermission}>
          コンパスを有効にする
        </button>
      </div>
    );
  }
  if (heading === null) {
    return <p className="cg-msg">コンパス読み込み中…</p>;
  }

  const diff = angleDiff(targetBearing, heading);
  const absD = Math.abs(diff);
  const status: "ok" | "warn" | "ng" = absD <= 30 ? "ok" : absD <= 60 ? "warn" : "ng";
  const label =
    absD <= 30
      ? "正しい方向です ✓"
      : diff < 0
      ? `左に約 ${Math.round(absD)}° 回転`
      : `右に約 ${Math.round(absD)}° 回転`;

  return (
    <div className={`cg-wrap cg-${status}`}>
      <div className="cg-compass">
        <div className="cg-you-ptr" />
        <div
          className="cg-rose"
          style={{ transform: `rotate(${-heading}deg)` }}
        >
          <svg viewBox="0 0 160 160" className="cg-svg">
            {TICKS.map(({ deg, rad, isMajor, r1 }) => (
              <line
                key={deg}
                x1={80 + r1 * Math.sin(rad)}
                y1={80 - r1 * Math.cos(rad)}
                x2={80 + 72 * Math.sin(rad)}
                y2={80 - 72 * Math.cos(rad)}
                stroke={isMajor ? "#94a3b8" : "#cbd5e1"}
                strokeWidth={isMajor ? 2 : 1}
              />
            ))}
            <g transform={`rotate(${targetBearing}, 80, 80)`}>
              <polygon points="80,14 74,80 86,80" fill="#ef4444" />
              <polygon points="80,146 74,80 86,80" fill="#94a3b8" opacity="0.6" />
            </g>
            <circle cx="80" cy="80" r="5" fill="white" stroke="#94a3b8" strokeWidth="1.5" />
          </svg>
          <span className="cg-label cg-n">N</span>
          <span className="cg-label cg-e">E</span>
          <span className="cg-label cg-s">S</span>
          <span className="cg-label cg-w">W</span>
        </div>
      </div>
      <p className={`cg-status-label cg-status-${status}`}>{label}</p>
      <p className="cg-method-label">{method}基準</p>
    </div>
  );
};
