import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Node, NodeDetour, RouteResponse, RouteStepDetail, Setting } from "../types";
import { PhotoSlider } from "./PhotoSlider";
import { GoalPhotoGallery } from "./GoalPhotoGallery";
import { CompassGuide } from "./CompassGuide";
import { ARNavGuide } from "./ARNavGuide";
import { SurveyLauncher } from "./SurveyLauncher";
import { useCompass } from "../hooks/useCompass";
import { useRouteWS } from "../hooks/useRouteWS";
import { calcRoute } from "../utils/dijkstra";
import { gpsDistance } from "../utils/bearing";

const BASE = import.meta.env.VITE_API_URL ?? "";

// 次のチェックポイント（ノード）にこの距離(m)まで近づいたら「到着」とみなす
const ARRIVAL_RADIUS_M = 2;
// 「到着しました」を表示してから次のステップへ自動遷移するまでの待ち時間(ms)
const ARRIVAL_ADVANCE_MS = 1800;

// スクロール内に並ぶカード。通常の道案内ステップと、展開された寄り道（独立カード）の2種類。
// 寄り道は既定では「1つ後のカード」のヘッダーにプルダウンとして畳まれており（incomingDetour）、
// 展開したときだけ独立した detour カードとして列に挿入される。
// stepIndex は元になるステップの番号（WS送信・到着判定の基準）。
type GuideCard =
  | { kind: "step"; step: RouteStepDetail; stepIndex: number; incomingDetour: NodeDetour | null }
  | { kind: "detour"; detour: NodeDetour };

interface Props {
  route: RouteResponse;
  nodes: Node[];
  links: Link[];
  nodeDetours: NodeDetour[];
  onClose: () => void;
  settings: Setting;
  onReroute: (newRoute: RouteResponse) => void;
  /** 到着カードのアンケートボタンから /survey へ遷移する。 */
  onOpenSurvey: () => void;
  /** ホーム画面に埋め込むときは true。全画面ではなく残りの領域に収める。 */
  embedded?: boolean;
}

export const RouteGuide: React.FC<Props> = ({ route, nodes, links, nodeDetours, onClose, settings, onReroute, onOpenSurvey, embedded = false }) => {
  const mapNorthOffset = settings.map_north_offset;
  const last = route.node_path[route.node_path.length - 1];
  // ナビ全体の出発地・目的地。ログに載せて「どこからどこまで」を記録する。
  const originName = route.node_path[0]?.name ?? "";
  const destName = last?.name ?? "";

  // node_id → NodeDetour のルックアップマップ（説明・画像も持つ）
  const detourMap = useMemo(() => {
    const map = new Map<number, NodeDetour>();
    for (const d of nodeDetours) {
      if (d.detour_node) map.set(d.node_id, d);
    }
    return map;
  }, [nodeDetours]);

  // 展開中の寄り道（detour.id の集合）。既定は畳まれた状態。
  const [expandedDetours, setExpandedDetours] = useState<Set<number>>(new Set());
  const toggleDetour = (id: number) => {
    setExpandedDetours((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ゴールカードがホストする寄り道（最後のステップに紐づく寄り道）
  const goalDetour = useMemo(() => {
    const lastStep = route.steps[route.steps.length - 1];
    const d = lastStep ? detourMap.get(lastStep.to_node.id) : undefined;
    return d && d.detour_node ? d : null;
  }, [route.steps, detourMap]);

  // スクロールに並べるカード列を構築。
  // 寄り道は既定では「1つ後のステップカード」のヘッダーにプルダウン(incomingDetour)として畳む。
  // 展開された寄り道だけ、ホストカードの直前に独立した detour カードとして挿入する。
  const cards = useMemo<GuideCard[]>(() => {
    const list: GuideCard[] = [];
    route.steps.forEach((s, i) => {
      // このステップカードがホストする寄り道 = 直前ステップ(i-1)の到達ノードに紐づく寄り道
      const prevStep = i > 0 ? route.steps[i - 1] : null;
      const pd = prevStep ? detourMap.get(prevStep.to_node.id) : undefined;
      const incoming = pd && pd.detour_node ? pd : null;
      if (incoming && expandedDetours.has(incoming.id)) {
        list.push({ kind: "detour", detour: incoming });
        list.push({ kind: "step", step: s, stepIndex: i, incomingDetour: null });
      } else {
        list.push({ kind: "step", step: s, stepIndex: i, incomingDetour: incoming });
      }
    });
    // 最後のステップの寄り道はゴールカードがホストする。展開時はゴールの直前に挿入。
    if (goalDetour && expandedDetours.has(goalDetour.id)) {
      list.push({ kind: "detour", detour: goalDetour });
    }
    return list;
  }, [route.steps, detourMap, expandedDetours, goalDetour]);

  const { heading, permission, requestPermission } = useCompass();
  const { sendPosition, sendGoalReached, sendAction, ready: wsReady } = useRouteWS();
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [blockedLinkIds] = useState<number[]>([]);
  const [rerouteError, setRerouteError] = useState<string | null>(null);
  // 現在表示中のカードのインデックス（cards 配列基準。スクロール位置から算出）
  const [visibleCardIndex, setVisibleCardIndex] = useState(0);
  // どのカードを AR 表示中か（ステップカードのみ。null は通常＝画像表示）
  const [arCardIndex, setArCardIndex] = useState<number | null>(null);
  // 位置情報で到着したカード（その ARNavGuide に「到着しました」を表示する）
  const [arrivedCardIndex, setArrivedCardIndex] = useState<number | null>(null);
  // 現在カードの目的ノードまでの距離(m)。AR の「到着まで◯m」表示に使う（GPS が無ければ null）
  const [distanceToTarget, setDistanceToTarget] = useState<number | null>(null);
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
    setExpandedDetours(new Set());
    handledArrivalRef.current.clear();
    autoAdvanceArRef.current = null;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [route]);

  // 別カードへスクロールしたら AR を閉じてカメラを止める。
  // ただし到着による自動遷移中（autoAdvanceArRef が遷移先と一致）は、遷移先でも AR を開いたままにする。
  // 埋め込み(embedded)時は下の「初めからAR」効果が制御するのでこの効果は無効化する。
  useEffect(() => {
    if (embedded) return;
    if (arCardIndex !== null && arCardIndex !== visibleCardIndex) {
      if (autoAdvanceArRef.current === visibleCardIndex) {
        setArCardIndex(visibleCardIndex);
        autoAdvanceArRef.current = null;
      } else {
        setArCardIndex(null);
      }
    }
  }, [visibleCardIndex, arCardIndex, embedded]);

  // 埋め込み時は、表示中のステップカードを初めから AR 表示にする（「ARで案内する」を押さなくてよい）。
  // 依存に arCardIndex を入れないので、ユーザーが「画像案内に戻る」で閉じた場合は
  // カードを移動する（visibleCardIndex が変わる）までは画像案内のまま維持される。
  // 表示中の 1 枚だけカメラを起動するため、カメラの多重起動は起きない。
  useEffect(() => {
    if (!embedded) return;
    const card = visibleCardIndex < cards.length ? cards[visibleCardIndex] : null;
    setArCardIndex(card && card.kind === "step" ? visibleCardIndex : null);
  }, [embedded, visibleCardIndex, cards]);

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

  // AR から「次に進む」を押したとき：次のカードへ。次もステップカードなら AR を継続する。
  const goToNextCard = (fromIndex: number) => {
    const next = fromIndex + 1;
    if (
      arCardIndexRef.current === fromIndex &&
      next < cards.length && cards[next].kind === "step"
    ) {
      autoAdvanceArRef.current = next;
    }
    scrollToCard(next);
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

  // 現在カードの目的ノードまでの距離を常時計算し、AR の「到着まで◯m」表示に渡す。
  // ステップカード以外・GPS 未取得・座標未設定のときは null（表示しない）。
  useEffect(() => {
    if (userLat == null || userLng == null) { setDistanceToTarget(null); return; }
    const card = visibleCardIndex < cards.length ? cards[visibleCardIndex] : null;
    if (!card || card.kind !== "step") { setDistanceToTarget(null); return; }
    const target = card.step.to_node;
    if (target.lat == null || target.lng == null) { setDistanceToTarget(null); return; }
    setDistanceToTarget(gpsDistance(userLat, userLng, target.lat, target.lng));
  }, [userLat, userLng, visibleCardIndex, cards]);

  // ナビ開始の初回位置送信。最初のステップカードは表示されていてもスクロールが起きず、
  // このまま放置すると 2 枚目にスクロールした時の position が nav_start になってしまう。
  // WebSocket 接続完了時に最初のステップを 1 回送り、目的地選択＝ナビ開始を確実に記録する。
  const initialSentRef = useRef(false);
  useEffect(() => {
    if (!wsReady || initialSentRef.current) return;
    const firstStep = cards.find((c) => c.kind === "step") as
      | Extract<GuideCard, { kind: "step" }>
      | undefined;
    if (!firstStep) return;
    initialSentRef.current = true;
    const s = firstStep.step;
    sendPosition(s.step_number, route.steps.length, s.from_node.name, s.to_node.name, s.from_node.id, s.to_node.id, originName, destName);
  }, [wsReady, cards, route.steps.length, originName, destName, sendPosition]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const cardHeight = el.clientHeight - 44;
    if (cardHeight <= 0) return;
    const rawIndex = Math.round(el.scrollTop / cardHeight);
    if (rawIndex >= cards.length) {
      setVisibleCardIndex(cards.length);
      const goal = route.node_path[route.node_path.length - 1];
      sendGoalReached(goal.name, goal.id, route.steps.length, originName);
      return;
    }
    if (rawIndex >= 0) {
      setVisibleCardIndex(rawIndex);
      const card = cards[rawIndex];
      // 位置情報の送信はステップカードのときだけ（寄り道カードは現在地を変えない）
      if (card.kind === "step") {
        const s = card.step;
        sendPosition(s.step_number, route.steps.length, s.from_node.name, s.to_node.name, s.from_node.id, s.to_node.id, originName, destName);
      }
    }
  };


  return (
    <div className={`route-guide ${embedded ? "embedded" : "fullscreen"}`}>
      {rerouteError && (
        <div className="reroute-error" onClick={() => setRerouteError(null)}>
          ⚠ {rerouteError}
        </div>
      )}

      <div className="route-guide-scroll" ref={scrollRef} onScroll={handleScroll}>
        {cards.map((card, ci) => {
          // 展開された寄り道は独立したカードとして表示する
          if (card.kind === "detour") {
            const detour = card.detour;
            const detourNode = detour.detour_node!;
            // 説明は寄り道カード専用のものを優先し、無ければノードの説明で代替
            const detourDesc = detour.description || detourNode.description;
            return (
              <div key={ci} className="rg-step rg-detour-card">
                <div className="rg-detour-suggestion">
                  <button className="rg-detour-collapse" onClick={() => toggleDetour(detour.id)}>
                    <span className="rg-detour-badge">寄り道提案</span>
                    <span className="rg-detour-name">{detourNode.name}</span>
                    <span className="rg-detour-caret">▲</span>
                  </button>
                  {detourNode.wait_time > 0 && (
                    <div className="rg-detour-status">
                      <span className="rg-detour-wait">待ち約{detourNode.wait_time}分</span>
                    </div>
                  )}
                  {detour.image_url && (
                    <img className="rg-detour-img" src={`${BASE}${detour.image_url}`} alt="" />
                  )}
                  {detourDesc && (
                    <span className="rg-detour-desc">{detourDesc}</span>
                  )}
                  <button
                    className="btn-detour-start"
                    onClick={() => {
                      // 元ノード（寄り道の分岐ノード）から寄り道先までの道案内を新たに開始する
                      const newRoute = calcRoute(nodes, links, detour.node_id, detour.detour_node_id, blockedLinkIds);
                      if (!newRoute) {
                        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
                        setRerouteError("元ノードから寄り道先への経路が見つかりませんでした");
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
              {/* 1つ前のステップに紐づく寄り道を、このカードのヘッダーにプルダウンで畳んでおく */}
              {card.incomingDetour && (
                <button
                  className="rg-detour-pulldown"
                  onClick={() => toggleDetour(card.incomingDetour!.id)}
                >
                  <span className="rg-detour-badge">寄り道できます</span>
                  <span className="rg-detour-pulldown-name">{card.incomingDetour.detour_node!.name}</span>
                  <span className="rg-detour-caret">▼</span>
                </button>
              )}
              <div className="rg-step-content">
              <div className="rg-step-header">
                <div className="rg-step-number">{s.step_number}</div>
                <div className="rg-step-title">
                  <span className="rg-from">{s.from_node.name}</span>
                  <span className="rg-arrow">→</span>
                  <span className="rg-to">{s.to_node.name}</span>
                </div>
                {/* AR カード表示中は、経路名の真横に到着確認の案内文を出す */}
                {arCardIndex === ci && (
                  <span className="rg-ar-inline-hint">到着地点を確認してスクロール</span>
                )}
                {s.link.photos && s.link.photos.length > 0 && (
                  <span className="rg-photo-badge">📷 {s.link.photos.length}</span>
                )}
              </div>
              {/* 埋め込み(AR)カードでは AR 側に情報を集約するため、リンク名・距離・コンパス文言は出さない */}
              {!embedded && s.link.name && <p className="rg-link-name">{s.link.name}</p>}
              {!embedded && s.link.description && <p className="rg-description">{s.link.description}</p>}
              {!embedded && <p className="rg-distance">距離: {s.link.distance.toFixed(1)}</p>}
              {/* コンパスの向きは常にマップ座標＋map_north_offset で算出する。
                  GPS(userLat/Lng)を渡すと屋内で不安定な GPS 方位に切り替わり、
                  オフセット補正が効かなくなるため、ここでは渡さない（GPS は到着判定のみに使用）。 */}
              {!embedded && (
                <CompassGuide
                  step={s}
                  heading={heading}
                  permission={permission}
                  onRequestPermission={requestPermission}
                  userLat={null}
                  userLng={null}
                  mapNorthOffset={mapNorthOffset}
                />
              )}
              {arCardIndex === ci ? (
                <ARNavGuide
                  step={s}
                  heading={heading}
                  permission={permission}
                  onRequestPermission={requestPermission}
                  userLat={null}
                  userLng={null}
                  mapNorthOffset={mapNorthOffset}
                  onClose={() => setArCardIndex(null)}
                  onNext={() => goToNextCard(ci)}
                  arrived={arrivedCardIndex === ci}
                  distance={distanceToTarget}
                  onConfirmArrival={() =>
                    sendAction("arrival_view", s.step_number, route.steps.length, s.from_node.name, s.to_node.name, originName, destName)
                  }
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
                        sendAction("ar_start", s.step_number, route.steps.length, s.from_node.name, s.to_node.name, originName, destName);
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
                  <p className="rg-scroll-hint">スクロールして次の案内を開始する</p>
                </>
              )}
              </div>
            </div>
          );
        })}

        <div className="rg-goal">
          {/* 最後のステップの寄り道は、畳まれている間ゴールカードのヘッダーにプルダウンで出す */}
          {goalDetour && !expandedDetours.has(goalDetour.id) && (
            <button
              className="rg-detour-pulldown"
              onClick={() => toggleDetour(goalDetour.id)}
            >
              <span className="rg-detour-badge">寄り道できます</span>
              <span className="rg-detour-pulldown-name">{goalDetour.detour_node!.name}</span>
              <span className="rg-detour-caret">▼</span>
            </button>
          )}
          <div className="rg-goal-icon">ゴール</div>
          <div className="rg-goal-name">{last.name}</div>
          {/* アンケート・戻るボタンを横一列で、写真の上に配置する */}
          <div className="rg-goal-actions">
            <SurveyLauncher fallbackUrl={settings.survey_url} onOpen={onOpenSurvey} />
            <button className="btn-back-home" onClick={onClose}>目的地選択に戻る</button>
          </div>
          {/* 到着地点の写真（閲覧専用）。登録・削除は管理画面のみ。
              nodes プロップに写真があればそれを初期値に使う。 */}
          <GoalPhotoGallery
            nodeId={last.id}
            initialPhotos={nodes.find((n) => n.id === last.id)?.photos}
          />
        </div>
      </div>
    </div>
  );
};
