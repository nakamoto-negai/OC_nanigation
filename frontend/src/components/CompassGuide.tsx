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

const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];

function bearingToText(bearing: number): string {
  return DIRS[Math.round(bearing / 45) % 8];
}

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

  const dirText = `${bearingToText(targetBearing)}方向へ進む`;

  if (heading !== null && permission === "granted") {
    const diff = angleDiff(targetBearing, heading);
    const absD = Math.abs(diff);
    const status: "ok" | "warn" | "ng" = absD <= 30 ? "ok" : absD <= 60 ? "warn" : "ng";
    const rotLabel =
      absD <= 30 ? "正しい方向です ✓"
      : diff < 0 ? `左に約 ${Math.round(absD)}° 回転`
      : `右に約 ${Math.round(absD)}° 回転`;

    return (
      <div className="cg-text">
        <span className={`cg-dir-label cg-dir-${status}`}>{rotLabel}</span>
        <span className="cg-dir-sub">{dirText}（{method}基準）</span>
      </div>
    );
  }

  return (
    <div className="cg-text">
      <span className="cg-dir-label cg-dir-ok">{dirText}</span>
      <span className="cg-dir-sub">{method}基準</span>
      {permission === "prompt" && (
        <button className="cg-enable-btn" onClick={onRequestPermission}>
          コンパスを有効にする
        </button>
      )}
    </div>
  );
};
