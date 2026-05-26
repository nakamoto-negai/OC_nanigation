import React, { useState } from "react";
import { Link, Node, RouteResponse } from "../types";
import { calcRoute } from "../utils/dijkstra";

const CONGESTION_LABELS = ["", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["", "#22c55e", "#f59e0b", "#ef4444"] as const;

interface Props {
  nodes: Node[];
  links: Link[];
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

export const HomePage: React.FC<Props> = ({ nodes, links, onRouteReady }) => {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("unavailable");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [startId, setStartId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // geolocation disabled
  void geoStatus; void setGeoStatus; void userLat; void setUserLat; void userLng; void setUserLng; void nearestNode;

  const startNode = nodes.find((n) => n.id === startId) ?? null;

  const goTo = (goal: Node) => {
    if (!startId) {
      setError("現在地が特定できません。現在地を手動で選択してください。");
      return;
    }
    if (startId === goal.id) {
      setError("現在地と目的地が同じです。");
      return;
    }
    setError("");
    const result = calcRoute(nodes, links, startId, goal.id);
    if (!result) {
      setError("ルートが見つかりませんでした。");
      return;
    }
    onRouteReady(result, startNode!, goal);
  };

  const destinations = nodes.filter((n) => n.id !== startId && n.is_selectable);

  return (
    <div className="home-page">
      {/* 現在地バナー */}
      <div className="location-banner unavailable">
        <span className="loc-icon">⚠</span>
        <div className="loc-text">
          <span className="loc-label">現在地を選択してください</span>
        </div>
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
              >
                <div className="dest-card-inner">
                  <div className="dest-card-icon">▶</div>
                  <div className="dest-card-info">
                    <div className="dest-card-name-row">
                      <span className="dest-card-name">{n.name}</span>
                      {n.congestion_level > 0 && (
                        <span className="dest-congestion-badge" style={{ background: CONGESTION_COLORS[n.congestion_level] }}>
                          {CONGESTION_LABELS[n.congestion_level]}
                        </span>
                      )}
                    </div>
                    {n.description && (
                      <span className="dest-card-desc">{n.description}</span>
                    )}
                  </div>
                  <span className="dest-card-arrow">→</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
