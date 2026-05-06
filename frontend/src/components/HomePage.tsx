import React, { useEffect, useState } from "react";
import { Node, RouteResponse } from "../types";
import { api } from "../api/client";

interface Props {
  nodes: Node[];
  onRouteReady: (route: RouteResponse, startNode: Node, goalNode: Node) => void;
}

type GeoStatus = "pending" | "found" | "denied" | "unavailable";

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
    haversine(lat, lng, n.lat!, n.lng!) < haversine(lat, lng, best.lat!, best.lng!)
      ? n
      : best
  );
}

export const HomePage: React.FC<Props> = ({ nodes, onRouteReady }) => {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("pending");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [startId, setStartId] = useState<number | null>(null);
  const [calculating, setCalculating] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLat(latitude);
        setUserLng(longitude);
        setGeoStatus("found");
        const nearest = nearestNode(nodes, latitude, longitude);
        if (nearest) setStartId(nearest.id);
      },
      () => {
        setGeoStatus("denied");
      },
      { timeout: 10000, maximumAge: 30000 }
    );
  }, [nodes]);

  const startNode = nodes.find((n) => n.id === startId) ?? null;

  const goTo = async (goal: Node) => {
    if (!startId) {
      setError("現在地が特定できません。現在地を手動で選択してください。");
      return;
    }
    if (startId === goal.id) {
      setError("現在地と目的地が同じです。");
      return;
    }
    setCalculating(goal.id);
    setError("");
    try {
      const route = await api.route.calc(startId, goal.id);
      onRouteReady(route, startNode!, goal);
    } catch (e: any) {
      setError("ルートが見つかりませんでした。");
    } finally {
      setCalculating(null);
    }
  };

  const destinations = nodes.filter((n) => n.id !== startId);

  return (
    <div className="home-page">
      {/* 現在地バナー */}
      <div className={`location-banner ${geoStatus}`}>
        {geoStatus === "pending" && (
          <>
            <span className="loc-icon spin">◎</span>
            <span>位置情報を取得中...</span>
          </>
        )}
        {geoStatus === "found" && (
          <>
            <span className="loc-icon">◉</span>
            <div className="loc-text">
              <span className="loc-label">現在地</span>
              <span className="loc-name">{startNode?.name ?? "最寄り地点を特定中..."}</span>
              {userLat != null && (
                <span className="loc-coords">{userLat.toFixed(5)}, {userLng!.toFixed(5)}</span>
              )}
            </div>
          </>
        )}
        {geoStatus === "denied" && (
          <>
            <span className="loc-icon">⚠</span>
            <div className="loc-text">
              <span className="loc-label">位置情報が使えません</span>
              <span className="loc-name">下から現在地を手動選択してください</span>
            </div>
          </>
        )}
        {geoStatus === "unavailable" && (
          <>
            <span className="loc-icon">⚠</span>
            <div className="loc-text">
              <span className="loc-label">このブラウザは位置情報に対応していません</span>
            </div>
          </>
        )}

        {/* 現在地の手動選択 */}
        {(geoStatus === "denied" || geoStatus === "unavailable" || geoStatus === "found") && (
          <select
            className="loc-manual-select"
            value={startId ?? ""}
            onChange={(e) => setStartId(Number(e.target.value) || null)}
          >
            <option value="">現在地を選択...</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="home-error" onClick={() => setError("")}>{error} ✕</div>
      )}

      {/* 目的地リスト */}
      <div className="dest-section">
        <h2 className="dest-heading">目的地を選んでください</h2>
        {nodes.length === 0 ? (
          <p className="dest-empty">管理画面でノードを登録してください</p>
        ) : destinations.length === 0 ? (
          <p className="dest-empty">他の目的地がありません</p>
        ) : (
          <div className="dest-list">
            {destinations.map((n) => (
              <button
                key={n.id}
                className="dest-card"
                onClick={() => goTo(n)}
                disabled={calculating !== null}
              >
                <div className="dest-card-inner">
                  <div className="dest-card-icon">▶</div>
                  <div className="dest-card-info">
                    <span className="dest-card-name">{n.name}</span>
                    {n.description && (
                      <span className="dest-card-desc">{n.description}</span>
                    )}
                  </div>
                  {calculating === n.id ? (
                    <span className="dest-card-loading">計算中...</span>
                  ) : (
                    <span className="dest-card-arrow">→</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
