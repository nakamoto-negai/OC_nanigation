import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Node, NodeDetour, RouteResponse, RouteStepDetail, Setting } from "../types";
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

// スクロール内に並ぶカード。通常の道案内ステップと、寄り道提案（独立カード）の2種類。
// stepIndex は元になるステップの番号（WS送信・到着判定の基準）。
type GuideCard =
  | { kind: "step"; step: RouteStepDetail; stepIndex: number }
  | { kind: "detour"; detourNode: Node; originStep: RouteStepDetail; stepIndex: number };

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

  // スクロールに並べるカード列を構築。各ステップの直後に、寄り道先があれば独立カードを挿入する。
  const cards = useMemo<GuideCard[]>(() => {
    const list: GuideCard[] = [];
    route.steps.forEach((s, i) => {
      list.push({ kind: "step", step: s, stepIndex: i });
      const dn = detourMap.get(s.to_node.id);
      if (dn) list.push({ kind: "detour", detourNode: dn, originStep: s, stepIndex: i });
    });
    return list;
  }, [route.steps, detourMap]);

  const { heading, permission, requestPermission } = useCompass();
  const { sendPosition, sendGoalReached, sendReroute } = useRouteWS();
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [blockedLinkIds, setBlockedLinkIds] = useState<number[]>([]);
  const [rerouteError, setRerouteError] = useState<string | null>(null);
  // 現在表示中のカードのインデックス（cards 配列基準。スクロール位置から算出）
  const [visibleCardIndex, setVisibleCardIndex] = useState(0);
  // どのカードを AR 表示中か（ステップカードのみ。null は通常＝画像表示）
  const [arCardIndex, setArCardIndex] = useState<number | null>(null);
  // 位置情報で到着したカード（その ARNavGuide に「到着しました」を表示する）
  const [arrivedCardIndex, setArrivedCardIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 到着判定を一度処理したカードを記録（同じカードで何度も発火させない）
  const handledArrivalRef = useRef<Set<number>>(new Set());
  // 到着で自動遷移する際、遷移先でも AR を開いたままにするためのフラグ
  const autoAdvanceArRef = useRef<number | null>(null);
  // 到着の自動遷移タイマー内から最新の arCardIndex を読むためのミラー
  const arCardIndexRef = useRef<number | null>(null);
  useEffect(() => { arCardIndexRef.current = arCardIndex; }, [arCardIndex]);

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
    setVisibleCardIndex(0);
    setArCardIndex(null);
    setArrivedCardIndex(null);
    handledArrivalRef.current.clear();
    autoAdvanceArRef.current = null;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [route]);

  // 別カードへスクロールしたら AR を閉じてカメラを止める。
  // ただし到着による自動遷移中（autoAdvanceArRef が遷移先と一致）は、遷移先でも AR を開いたままにする。
  useEffect(() => {
    if (arCardIndex !== null && arCardIndex !== visibleCardIndex) {
      if (autoAdvanceArRef.current === visibleCardIndex) {
        setArCardIndex(visibleCardIndex);
        autoAdvanceArRef.current = null;
      } else {
        setArCardIndex(null);
      }
    }
  }, [visibleCardIndex, arCardIndex]);

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

  // 1 カード分スクロールする（到着時の自動遷移に使う）
  const scrollToCard = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardHeight = el.clientHeight - 44;
    const top = i >= cards.length ? el.scrollHeight : i * cardHeight;
    el.scrollTo({ top, behavior: "smooth" });
  };

  // GPS が次のチェックポイント（現在ステップカードの to_node）に近づいたら「到着しました」を表示し、
  // 少し待ってから次のカードへ自動遷移する。
  useEffect(() => {
    if (userLat == null || userLng == null) return;
    const card = visibleCardIndex < cards.length ? cards[visibleCardIndex] : null;
    if (!card || card.kind !== "step") return;
    if (handledArrivalRef.current.has(visibleCardIndex)) return;
    const target = card.step.to_node;
    if (target.lat == null || target.lng == null) return;

    const dist = gpsDistance(userLat, userLng, target.lat, target.lng);
    if (dist > ARRIVAL_RADIUS_M) return;

    handledArrivalRef.current.add(visibleCardIndex);
    setArrivedCardIndex(visibleCardIndex);
    const next = visibleCardIndex + 1;
    const t = setTimeout(() => {
      setArrivedCardIndex(null);
      // AR 表示中で、遷移先もステップカードなら AR を継続する
      if (
        arCardIndexRef.current === visibleCardIndex &&
        next < cards.length && cards[next].kind === "step"
      ) {
        autoAdvanceArRef.current = next;
      }
      scrollToCard(next);
    }, ARRIVAL_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [userLat, userLng, visibleCardIndex, cards]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const cardHeight = el.clientHeight - 44;
    if (cardHeight <= 0) return;
    const rawIndex = Math.round(el.scrollTop / cardHeight);
    if (rawIndex >= cards.length) {
      setVisibleCardIndex(cards.length);
      const goal = route.node_path[route.node_path.length - 1];
      sendGoalReached(goal.name, goal.id, route.steps.length);
      return;
    }
    if (rawIndex >= 0) {
      setVisibleCardIndex(rawIndex);
      const card = cards[rawIndex];
      // 位置情報の送信はステップカードのときだけ（寄り道カードは現在地を変えない）
      if (card.kind === "step") {
        const s = card.step;
        sendPosition(s.step_number, route.steps.length, s.from_node.name, s.to_node.name, s.from_node.id, s.to_node.id);
      }
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

  // 現在表示中のカード（ステップカードのときだけ迂回バーや到着判定の対象になる）
  const currentCard = visibleCardIndex < cards.length ? cards[visibleCardIndex] : null;
  const currentStep = currentCard?.kind === "step" ? currentCard.step : null;

  return (
    <div className="route-guide fullscreen">
      <div className="route-guide-header">
        <div className="route-header-right">
          <button className="close-btn" onClick={onClose}>✕ 閉じる</button>
        </div>
      </div>

      {rerouteError && (
        <div className="reroute-error" onClick={() => setRerouteError(null)}>
          ⚠ {rerouteError}
        </div>
      )}

      {currentStep && (
        <div className="blocked-btn-bar">
          {REROUTE_REASONS.length === 0 ? (
            <button
              className="btn-blocked btn-blocked-single"
              onClick={() =>
                handleBlock(currentStep.link.id, currentStep.step_number, currentStep.from_node.name, currentStep.to_node.name, "other")
              }
            >
              迂回する
            </button>
          ) : (
            REROUTE_REASONS.map(({ label, reason }) => (
              <button
                key={reason}
                className="btn-blocked"
                onClick={() =>
                  handleBlock(currentStep.link.id, currentStep.step_number, currentStep.from_node.name, currentStep.to_node.name, reason)
                }
              >
                {label}
              </button>
            ))
          )}
        </div>
      )}

      <div className="route-guide-scroll" ref={scrollRef} onScroll={handleScroll}>
        {cards.map((card, ci) => {
          // 寄り道は独立したカードとして表示する
          if (card.kind === "detour") {
            const detourNode = card.detourNode;
            const originStep = card.originStep;
            return (
              <div key={ci} className="rg-step rg-detour-card">
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
                      const newRoute = calcRoute(nodes, links, originStep.to_node.id, detourNode.id, blockedLinkIds);
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
              </div>
            );
          }

          const s = card.step;
          return (
            <div key={ci} className="rg-step">
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
              {arCardIndex === ci ? (
                <ARNavGuide
                  step={s}
                  heading={heading}
                  permission={permission}
                  onRequestPermission={requestPermission}
                  userLat={userLat}
                  userLng={userLng}
                  mapNorthOffset={mapNorthOffset}
                  onClose={() => setArCardIndex(null)}
                  arrived={arrivedCardIndex === ci}
                />
              ) : (
                <>
                  <div className="rg-action-row">
                    {permission === "prompt" && (
                      <button className="cg-enable-btn" onClick={requestPermission}>
                        コンパスを有効にする
                      </button>
                    )}
                    <button
                      className="btn-ar-start"
                      onClick={() => {
                        // ボタン押下はユーザー操作なので、ここで iOS のコンパス許可も要求する
                        if (permission === "prompt") requestPermission();
                        setArCardIndex(ci);
                      }}
                    >
                      ARで案内する
                    </button>
                  </div>
                  {s.link.photos && s.link.photos.length > 0 && (
                    <div className="rg-photos">
                      <PhotoSlider photos={s.link.photos} />
                    </div>
                  )}
                </>
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
