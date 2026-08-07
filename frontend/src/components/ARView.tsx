import React, { useEffect, useState } from "react";
import { Node } from "../types";
import { ARRecognizer } from "./ARRecognizer";

interface Props {
  nodes: Node[];
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNode(nodes: Node[], lat: number, lng: number): Node | null {
  const withCoords = nodes.filter((n) => n.lat != null && n.lng != null);
  if (withCoords.length === 0) return null;
  return withCoords.reduce((best, n) =>
    haversine(lat, lng, n.lat!, n.lng!) < haversine(lat, lng, best.lat!, best.lng!) ? n : best,
  );
}

/**
 * ユーザー向け「かざして調べる」画面。
 * 起動時に位置情報を取得し、最も近いノードを「現在地」として ARRecognizer に渡す。
 * ARRecognizer はその地点から「見える地点」に含む対象だけを照合する
 * （見える地点が未設定の対象はどこでも認識）。位置が取れないときは全対象を照合する。
 */
export const ARView: React.FC<Props> = ({ nodes }) => {
  // undefined = 取得中 / null = 位置不明（全対象） / number = その地点で絞り込み
  const [viewpointNodeId, setViewpointNodeId] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!navigator.geolocation) { setViewpointNodeId(null); return; }
    let done = false;
    const finish = (v: number | null) => { if (!done) { done = true; setViewpointNodeId(v); } };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const n = nearestNode(nodes, pos.coords.latitude, pos.coords.longitude);
        finish(n ? n.id : null);
      },
      () => finish(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
    // getCurrentPosition が返らない端末に備えたフォールバック
    const t = window.setTimeout(() => finish(null), 9000);
    return () => window.clearTimeout(t);
  }, [nodes]);

  if (viewpointNodeId === undefined) {
    return (
      <div className="ar-view-screen">
        <p className="ar-view-hint">現在地を確認しています…</p>
      </div>
    );
  }

  return (
    <div className="ar-view-screen">
      <p className="ar-view-hint">
        パンフレットや学科の看板などにカメラを向けると、登録済みの対象を認識して説明とリンクを表示します。
      </p>
      <ARRecognizer viewpointNodeId={viewpointNodeId} />
    </div>
  );
};
