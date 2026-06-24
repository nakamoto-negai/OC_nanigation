import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Node, NodeDetour, RouteResponse, RouteStepDetail, Setting } from "../types";

const CONGESTION_LABELS = ["不明", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["#94a3b8", "#22c55e", "#f59e0b", "#ef4444"] as const;

function CongestionBadge({ level, alwaysShow }: { level: number; alwaysShow?: boolean }) {
  if (level === 0 && !alwaysShow) return null;
  return (
    <span className="rg-congestion-badge" style={{ background: CONGESTION_COLORS[level] ?? CONGESTION_COLORS[0] }}>
      {CONGESTION_LABELS[level] ?? "不明"}
    </span>
  );
}
import { PhotoSlider } from "./PhotoSlider";
import { CompassGuide } from "./CompassGuide";
import { ARNavGuide } from "./ARNavGuide";
import { useCompass } from "../hooks/useCompass";
import { useRouteWS } from "../hooks/useRouteWS";
import { calcRoute } from "../utils/dijkstra";
import { gpsDistance } from "../utils/bearing";

// 次のチェックポイント（ノード）にこの距離(m)まで近づいたら「到着」とみなす
const ARRIVAL_RADIUS_M = 20;
// 「到着しました」を表示してから次のステップへ自動遷移するまでの待ち時間(ms)
const ARRIVAL_ADVANCE_MS = 1800;

interface Props {
  route: RouteResponse;
  nodes: Node[];
  links: Link[];
  nodeDetours: NodeDetour[];
  onClose: () => void;
  settings: Setting;
  onReroute: (newRoute: RouteResponse) => void;
}

export const RouteGuide: React.FC<Props> = ({ route, nodes, links, nodeDetours, onClose, settings, onReroute }) => {
  const mapNorthOffset = settings.map_north_offset;
  const last = route.node_path[route.node_path.length - 1];

  // node_id → detour_node のルックアップマップ
  const detourMap = useMemo(() => {
    const map = new Map<number, Node>();
    for (const d of nodeDetours) {
      if (d.detour_node) map.set(d.node_id, d.detour_node);
    }
    return map;
  }, [nodeDetours]);

  // ルート上の各ステップに紐づく寄り道先ノード（重複除去）
  const routeDetourNodes = useMemo(() => {
    const seen = new Set<number>();
    const result: Node[] = [];
    for (const s of route.steps) {
      const dn = detourMap.get(s.to_node.id);
      if (dn && !seen.has(dn.id)) {
        seen.add(dn.id);
        result.push(dn);
      }
    }
    return result;
  }, [route.steps, detourMap]);
  const { heading, permission, requestPermission } = useCompass();
  const { sendPosition, sendGoalReached, sendReroute } = useRouteWS();
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [blockedLinkIds, setBlockedLinkIds] = useState<number[]>([]);
  const [rerouteError, setRerouteError] = useState<string | null>(null);
  const [visibleStepIndex, setVisibleStepIndex] = useState(0);
  // どのステップのカードを AR 表示中か（null は通常＝画像表示）
  const [arStepIndex, setArStepIndex] = useState<number | null>(null);
  // 位置情報で到着したステップ（そのカードの ARNavGuide に「到着しました」を表示する）
  const [arrivedStepIndex, setArrivedStepIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 到着判定を一度処理したステップを記録（同じステップで何度も発火させない）
  const handledArrivalRef = useRef<Set<number>>(new Set());
  // 到着で自動遷移する際、遷移先でも AR を開いたままにするためのフラグ
  const autoAdvanceArRef = useRef<number | null>(null);
  // 到着の自動遷移タイマー内から最新の arStepIndex を読むためのミラー
  const arStepIndexRef = useRef<number | null>(null);
  useEffect(() => { arStepIndexRef.current = arStepIndex; }, [arStepIndex]);

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
    setVisibleStepIndex(0);
    setArStepIndex(null);
    setArrivedStepIndex(null);
    handledArrivalRef.current.clear();
    autoAdvanceArRef.current = null;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [route]);

  // 別カードへスクロールしたら AR を閉じてカメラを止める。
  // ただし到着による自動遷移中（autoAdvanceArRef が遷移先と一致）は、遷移先でも AR を開いたままにする。
  useEffect(() => {
    if (arStepIndex !== null && arStepIndex !== visibleStepIndex) {
      if (autoAdvanceArRef.current === visibleStepIndex) {
        setArStepIndex(visibleStepIndex);
        autoAdvanceArRef.current = null;
      } else {
        setArStepIndex(null);
      }
    }
  }, [visibleStepIndex, arStepIndex]);

  // 現在地（GPS）を監視。到着判定に使う。
  // 権限を永久拒否している場合は watchPosition を呼ぶとコンソールエラーになるため、事前に確認する。
  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;
    let watchId: number | null = null;
    const start = () => {
      if (cancelled) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        },
        () => { /* 屋内など取得失敗は黙殺（到着判定は行われないだけ） */ },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
      );
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((st) => { if (st.state !== "denied") start(); })
        .catch(() => start());
    } else {
      start();
    }
    return () => {
      cancelled = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // 1 ステップ分スクロールする（到着時の自動遷移に使う）
  const scrollToStep = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardHeight = el.clientHeight - 44;
    const top = i >= route.steps.length ? el.scrollHeight : i * cardHeight;
    el.scrollTo({ top, behavior: "smooth" });
  };

  // GPS が次のチェックポイント（現在ステップの to_node）に近づいたら「到着しました」を表示し、
  // 少し待ってから次のステップへ自動遷移する。
  useEffect(() => {
    if (userLat == null || userLng == null) return;
    if (visibleStepIndex >= route.steps.length) return;
    if (handledArrivalRef.current.has(visibleStepIndex)) return;
    const target = route.steps[visibleStepIndex].to_node;
    if (target.lat == null || target.lng == null) return;

    const dist = gpsDistance(userLat, userLng, target.lat, target.lng);
    if (dist > ARRIVAL_RADIUS_M) return;

    handledArrivalRef.current.add(visibleStepIndex);
    setArrivedStepIndex(visibleStepIndex);
    const next = visibleStepIndex + 1;
    const t = setTimeout(() => {
      setArrivedStepIndex(null);
      // AR 表示中だった場合は遷移先でも開いたままにする
      if (arStepIndexRef.current === visibleStepIndex && next < route.steps.length) {
        autoAdvanceArRef.current = next;
      }
      scrollToStep(next);
    }, ARRIVAL_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [userLat, userLng, visibleStepIndex, route.steps]);

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

  const REROUTE_REASONS = [
    { label: "写真識別不可で迂回する！", reason: "visibility", enabled: settings.reroute_visibility },
    { label: "事故・工事で迂回する！",   reason: "incident",   enabled: settings.reroute_incident },
    { label: "混雑過多で迂回する！",     reason: "congestion", enabled: settings.reroute_congestion },
    { label: "その他で迂回する！",       reason: "other",      enabled: settings.reroute_other },
  ].filter((r) => r.enabled);

  const handleBlock = (
    linkId: number,
    stepNumber: number,
    fromNode: string,
    toNode: string,
    reason: string,
  ) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);

    const newBlocked = [...blockedLinkIds, linkId];
    const startId = route.node_path[0].id;
    const goalId = route.node_path[route.node_path.length - 1].id;
    const newRoute = calcRoute(nodes, links, startId, goalId, newBlocked);

    if (!newRoute) {
      setRerouteError("迂回路が見つかりませんでした");
      errorTimerRef.current = setTimeout(() => setRerouteError(null), 4000);
      return;
    }
    setBlockedLinkIds(newBlocked);
    onReroute(newRoute);
    sendReroute(stepNumber, route.steps.length, fromNode, toNode, reason);
  };

  return (
    <div className="route-guide fullscreen">
      <div className="route-guide-header">
        <div className="route-summary">
          <span className="route-title">道案内</span>
          <span className="route-distance">総距離: {route.total_distance.toFixed(1)}</span>
        </div>
        <div className="route-header-right">
          <button className="close-btn" onClick={onClose}>✕ 閉じる</button>
        </div>
        <div className="route-congestion-row">
          <div className="rcc-dest">
            <span className="rcc-label">目的地</span>
            <span className="rcc-name">{last.name}</span>
            <CongestionBadge level={last.congestion_level} alwaysShow />
          </div>
          {routeDetourNodes.map((dn) => (
            <React.Fragment key={dn.id}>
              <span className="rcc-sep">›</span>
              <div className="rcc-detour">
                <span className="rcc-label">寄り道</span>
                <span className="rcc-name">{dn.name}</span>
                <CongestionBadge level={dn.congestion_level} alwaysShow />
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {rerouteError && (
        <div className="reroute-error" onClick={() => setRerouteError(null)}>
          ⚠ {rerouteError}
        </div>
      )}

      {visibleStepIndex < route.steps.length && (
        <div className="blocked-btn-bar">
          {REROUTE_REASONS.length === 0 ? (
            <button
              className="btn-blocked btn-blocked-single"
              onClick={() => {
                const s = route.steps[visibleStepIndex];
                handleBlock(s.link.id, s.step_number, s.from_node.name, s.to_node.name, "other");
              }}
            >
              迂回する
            </button>
          ) : (
            REROUTE_REASONS.map(({ label, reason }) => (
              <button
                key={reason}
                className="btn-blocked"
                onClick={() => {
                  const s = route.steps[visibleStepIndex];
                  handleBlock(s.link.id, s.step_number, s.from_node.name, s.to_node.name, reason);
                }}
              >
                {label}
              </button>
            ))
          )}
        </div>
      )}

      <div className="route-guide-scroll" ref={scrollRef} onScroll={handleScroll}>
        {route.steps.map((s: RouteStepDetail, i) => {
          const detourNode = detourMap.get(s.to_node.id);
          return (
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
              {arStepIndex === i ? (
                <ARNavGuide
                  step={s}
                  heading={heading}
                  permission={permission}
                  onRequestPermission={requestPermission}
                  userLat={userLat}
                  userLng={userLng}
                  mapNorthOffset={mapNorthOffset}
                  onClose={() => setArStepIndex(null)}
                  arrived={arrivedStepIndex === i}
                />
              ) : (
                <>
                  <button
                    className="btn-ar-start"
                    onClick={() => {
                      // ボタン押下はユーザー操作なので、ここで iOS のコンパス許可も要求する
                      if (permission === "prompt") requestPermission();
                      setArStepIndex(i);
                    }}
                  >
                    ARで案内する
                  </button>
                  {s.link.photos && s.link.photos.length > 0 && (
                    <div className="rg-photos">
                      <PhotoSlider photos={s.link.photos} />
                    </div>
                  )}
                </>
              )}
              {detourNode && (
                <div className="rg-detour-suggestion">
                  <div className="rg-detour-header">
                    <span className="rg-detour-badge">寄り道提案</span>
                    <span className="rg-detour-name">{detourNode.name}</span>
                  </div>
                  {detourNode.wait_time > 0 && (
                    <div className="rg-detour-status">
                      <span className="rg-detour-wait">待ち約{detourNode.wait_time}分</span>
                    </div>
                  )}
                  {detourNode.description && (
                    <span className="rg-detour-desc">{detourNode.description}</span>
                  )}
                  <button
                    className="btn-detour-start"
                    onClick={() => {
                      const newRoute = calcRoute(nodes, links, s.to_node.id, detourNode.id, blockedLinkIds);
                      if (!newRoute) {
                        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
                        setRerouteError("寄り道先への経路が見つかりませんでした");
                        errorTimerRef.current = setTimeout(() => setRerouteError(null), 4000);
                        return;
                      }
                      onReroute(newRoute);
                    }}
                  >
                    ここに進む
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="rg-goal">
          <div className="rg-goal-icon">ゴール</div>
          <div className="rg-goal-name">{last.name}</div>
          <button className="btn-back-home" onClick={onClose}>目的地選択に戻る</button>
        </div>
      </div>
    </div>
  );
};
