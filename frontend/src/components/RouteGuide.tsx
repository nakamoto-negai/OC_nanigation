import React, { useEffect, useRef, useState } from "react";
import { RouteResponse, RouteStepDetail } from "../types";
import { PhotoSlider } from "./PhotoSlider";
import { CompassGuide } from "./CompassGuide";
import { useCompass } from "../hooks/useCompass";
import { useRouteWS } from "../hooks/useRouteWS";
import { api } from "../api/client";

interface Props {
  route: RouteResponse;
  onClose: () => void;
  mapNorthOffset: number;
  onReroute: (newRoute: RouteResponse) => void;
}

export const RouteGuide: React.FC<Props> = ({ route, onClose, mapNorthOffset, onReroute }) => {
  const last = route.node_path[route.node_path.length - 1];
  const { heading, permission, requestPermission } = useCompass();
  const { sendPosition, sendGoalReached, sendReroute } = useRouteWS();
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [blockedLinkIds, setBlockedLinkIds] = useState<number[]>([]);
  const [isRerouting, setIsRerouting] = useState(false);
  const [rerouteError, setRerouteError] = useState<string | null>(null);
  const [visibleStepIndex, setVisibleStepIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      el.style.setProperty("--card-h", `${el.clientHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let watchId: number | null = null;
    const start = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        () => {
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        }
      );
    };
    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" }).then((result) => {
        if (result.state !== "denied") start();
      });
    } else {
      start();
    }
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const cardHeight = el.clientHeight - 44;
    if (cardHeight <= 0) return;
    const rawIndex = Math.round(el.scrollTop / cardHeight);
    if (rawIndex >= route.steps.length) {
      setVisibleStepIndex(route.steps.length);
      const goal = route.node_path[route.node_path.length - 1];
      sendGoalReached(goal.name, goal.id, route.steps.length);
      return;
    }
    if (rawIndex >= 0) {
      setVisibleStepIndex(rawIndex);
      const s = route.steps[rawIndex];
      sendPosition(s.step_number, route.steps.length, s.from_node.name, s.to_node.name, s.from_node.id, s.to_node.id);
    }
  };

  const handleBlock = async (
    linkId: number,
    stepNumber: number,
    fromNode: string,
    toNode: string,
  ) => {
    if (isRerouting) return;
    setIsRerouting(true);
    setRerouteError(null);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);

    const newBlocked = [...blockedLinkIds, linkId];
    const startId = route.node_path[0].id;
    const goalId = route.node_path[route.node_path.length - 1].id;

    try {
      const newRoute = await api.route.calc(startId, goalId, newBlocked);
      setBlockedLinkIds(newBlocked);
      onReroute(newRoute);
      sendReroute(stepNumber, route.steps.length, fromNode, toNode);
    } catch {
      setRerouteError("迂回路が見つかりませんでした");
      errorTimerRef.current = setTimeout(() => setRerouteError(null), 4000);
    } finally {
      setIsRerouting(false);
    }
  };

  return (
    <div className="route-guide fullscreen">
      <div className="route-guide-header">
        <div className="route-summary">
          <span className="route-title">道案内</span>
          <span className="route-distance">総距離: {route.total_distance.toFixed(1)}</span>
          <div className="route-path">
            {route.node_path.map((n, i) => (
              <React.Fragment key={n.id}>
                <span className={`path-node ${i === 0 ? "start" : i === route.node_path.length - 1 ? "goal" : ""}`}>
                  {n.name}
                </span>
                {i < route.node_path.length - 1 && <span className="path-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="route-header-right">
          {isRerouting && <span className="rerouting-badge">迂回計算中…</span>}
          <button className="close-btn" onClick={onClose}>✕ 閉じる</button>
        </div>
      </div>

      {rerouteError && (
        <div className="reroute-error" onClick={() => setRerouteError(null)}>
          ⚠ {rerouteError}
        </div>
      )}

      {visibleStepIndex < route.steps.length && (
        <div className="blocked-btn-bar">
          <button
            className="btn-blocked"
            onClick={() => {
              const s = route.steps[visibleStepIndex];
              handleBlock(s.link.id, s.step_number, s.from_node.name, s.to_node.name);
            }}
            disabled={isRerouting}
          >
            ⚠ このルートが通れない
          </button>
        </div>
      )}

      <div className="route-guide-scroll" ref={scrollRef} onScroll={handleScroll}>
        {route.steps.map((s: RouteStepDetail, i) => (
          <div key={i} className="rg-step">
            <div className="rg-step-header">
              <div className="rg-step-number">{s.step_number}</div>
              <div className="rg-step-title">
                <span className="rg-from">{s.from_node.name}</span>
                <span className="rg-arrow">→</span>
                <span className="rg-to">{s.to_node.name}</span>
              </div>
              {s.link.photos && s.link.photos.length > 0 && (
                <span className="rg-photo-badge">📷 {s.link.photos.length}</span>
              )}
            </div>
            {s.link.name && <p className="rg-link-name">{s.link.name}</p>}
            {s.link.description && <p className="rg-description">{s.link.description}</p>}
            <p className="rg-distance">距離: {s.link.distance.toFixed(1)}</p>
            <CompassGuide
              step={s}
              heading={heading}
              permission={permission}
              onRequestPermission={requestPermission}
              userLat={userLat}
              userLng={userLng}
              mapNorthOffset={mapNorthOffset}
            />
            {s.link.photos && s.link.photos.length > 0 && (
              <div className="rg-photos">
                <PhotoSlider photos={s.link.photos} />
              </div>
            )}
          </div>
        ))}

        <div className="rg-goal">
          <div className="rg-goal-icon">ゴール</div>
          <div className="rg-goal-name">{last.name}</div>
          <button className="btn-back-home" onClick={onClose}>目的地選択に戻る</button>
        </div>
      </div>
    </div>
  );
};
