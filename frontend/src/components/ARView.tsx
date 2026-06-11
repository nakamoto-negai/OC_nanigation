import React, { useEffect, useState } from "react";
import { Node } from "../types";
import { nearestNode } from "../utils/geo";
import { ARRecognizer } from "./ARRecognizer";

interface Props {
  nodes: Node[];
}

type GeoStatus = "pending" | "found" | "denied" | "unavailable";

/**
 * ユーザー向け「建物を見る」画面。
 * GPS で現在地ノードを特定し、その地点から見える建物だけを認識対象に絞り込む。
 * 手動で現在地を選び直すこともできる。
 */
export const ARView: React.FC<Props> = ({ nodes }) => {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("unavailable");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [nodeId, setNodeId] = useState<number | null>(null);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    let watchId: number | null = null;

    const startWatching = () => {
      setGeoStatus("pending");
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
          setGeoStatus("found");
        },
        (e) => setGeoStatus(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
      );
    };

    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((res) => {
        if (res.state === "denied") {
          setGeoStatus("denied");
          return;
        }
        startWatching();
        res.onchange = () => {
          if (res.state === "denied") setGeoStatus("denied");
        };
      });
    } else {
      startWatching();
    }

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // GPS 更新時に最近傍ノードを自動設定（手動変更していない場合）
  useEffect(() => {
    if (manual || userLat == null || userLng == null) return;
    const nearest = nearestNode(nodes, userLat, userLng);
    if (nearest) setNodeId(nearest.id);
  }, [userLat, userLng, nodes, manual]);

  const currentNode = nodes.find((n) => n.id === nodeId) ?? null;

  return (
    <div className="ar-view-screen">
      <div className={`location-banner ${geoStatus}`}>
        <span className={`loc-icon${geoStatus === "pending" ? " spin" : ""}`}>
          {geoStatus === "pending" ? "⌛" : geoStatus === "found" ? "📍" : "⚠"}
        </span>
        <div className="loc-text">
          {geoStatus === "pending" && <span className="loc-label">現在地を特定しています...</span>}
          {geoStatus === "found" && currentNode && (
            <>
              <span className="loc-label">現在地（自動検出）</span>
              <span className="loc-name">{currentNode.name}</span>
            </>
          )}
          {geoStatus === "found" && !currentNode && (
            <span className="loc-label">近くに登録地点がありません</span>
          )}
          {geoStatus === "denied" && <span className="loc-label">位置情報の使用が許可されていません</span>}
          {geoStatus === "unavailable" && <span className="loc-label">現在地を選択してください</span>}
        </div>
        <select
          className="loc-manual-select"
          value={nodeId ?? ""}
          onChange={(e) => {
            setNodeId(Number(e.target.value) || null);
            setManual(true);
          }}
        >
          <option value="">現在地を選択...</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
      </div>

      <p className="ar-view-hint">
        カメラを建物に向けると、この地点から見える建物の名前を表示します。
      </p>

      <ARRecognizer nodes={nodes} viewpointNodeId={nodeId} />
    </div>
  );
};
