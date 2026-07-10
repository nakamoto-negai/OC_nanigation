import React, { useEffect, useState } from "react";
import { Category, Link, Node, RouteResponse } from "../types";
import { calcRoute } from "../utils/dijkstra";
import { SurveyLauncher } from "./SurveyLauncher";

const CONGESTION_LABELS = ["", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["", "#22c55e", "#f59e0b", "#ef4444"] as const;

interface Props {
  nodes: Node[];
  links: Link[];
  onRouteReady: (route: RouteResponse, startNode: Node, goalNode: Node) => void;
  /** アプリ内アンケートの質問が無いときのフォールバック先（設定の外部URL）。 */
  surveyUrl?: string;
  /** アプリ内アンケート（/survey）へ遷移する。 */
  onOpenSurvey: () => void;
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

export const HomePage: React.FC<Props> = ({ nodes, links, onRouteReady, surveyUrl, onOpenSurvey }) => {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("unavailable");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [startId, setStartId] = useState<number | null>(null);
  const [manualStart, setManualStart] = useState(false);
  const [error, setError] = useState("");

  // 位置情報の取得・監視
  useEffect(() => {
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }

    let watchId: number | null = null;

    const startWatching = () => {
      setGeoStatus("pending");
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
          setGeoStatus("found");
        },
        (err) => {
          setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    };

    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
        if (result.state === "denied") { setGeoStatus("denied"); return; }
        startWatching();
        result.onchange = () => { if (result.state === "denied") setGeoStatus("denied"); };
      });
    } else {
      startWatching();
    }

    return () => { if (watchId != null) navigator.geolocation.clearWatch(watchId); };
  }, []);

  // GPS 更新時に最近傍ノードを自動設定（手動変更していない場合）
  useEffect(() => {
    if (manualStart || userLat == null || userLng == null) return;
    const nearest = nearestNode(nodes, userLat, userLng);
    if (nearest) setStartId(nearest.id);
  }, [userLat, userLng, nodes, manualStart]);

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

  // カテゴリ別グループ（Category オブジェクト使用、sort_order 昇順、未設定は末尾）
  type Group = { key: string; label: string; cat: Category | null; items: Node[] };
  const grouped: Group[] = [];
  const seenIds = new Set<number>();
  const sorted = [...destinations].sort((a, b) => {
    const ao = a.category?.sort_order ?? Infinity;
    const bo = b.category?.sort_order ?? Infinity;
    if (ao !== bo) return ao - bo;
    return (a.category?.id ?? Infinity) - (b.category?.id ?? Infinity);
  });
  for (const n of sorted) {
    const cat = n.category ?? null;
    const key = cat ? String(cat.id) : "__none__";
    if (!grouped.find((g) => g.key === key)) {
      if (cat && seenIds.has(cat.id)) continue;
      if (cat) seenIds.add(cat.id);
      grouped.push({ key, label: cat?.name ?? "その他", cat, items: [] });
    }
    grouped.find((g) => g.key === key)!.items.push(n);
  }

  // アコーディオン開閉状態（初期値は is_open_default、未設定グループは open）
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenKeys((prev) => {
      const next = { ...prev };
      for (const g of grouped) {
        if (!(g.key in next)) {
          next[g.key] = g.cat?.is_open_default ?? true;
        }
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations.length]);

  const toggleGroup = (key: string) =>
    setOpenKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  const isOpen = (key: string) => openKeys[key] ?? true;

  const useAccordion = grouped.length > 1 || (grouped.length === 1 && grouped[0].key !== "__none__");

  const DestCard = ({ n }: { n: (typeof destinations)[0] }) => (
    <button className="dest-card" onClick={() => goTo(n)}>
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
          {n.description && <span className="dest-card-desc">{n.description}</span>}
          {n.events && n.events.length > 0 && (
            <div className="dest-event-marquee" aria-label="開催イベント">
              <div className="dest-event-track">
                {n.events.map((e) => (
                  <span key={e.id} className="dest-event-item">{e.name}</span>
                ))}
                {/* シームレスにループさせるため同じ内容をもう一組並べる */}
                {n.events.map((e) => (
                  <span key={`dup-${e.id}`} className="dest-event-item" aria-hidden="true">{e.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <span className="dest-card-arrow">→</span>
      </div>
    </button>
  );

  return (
    <div className="home-page">
      {/* 現在地バナー */}
      <div className={`location-banner ${geoStatus}`}>
        <span className={`loc-icon${geoStatus === "pending" ? " spin" : ""}`}>
          {geoStatus === "pending" ? "⌛" : geoStatus === "found" ? "📍" : "⚠"}
        </span>
        <div className="loc-text">
          {geoStatus === "pending" && (
            <span className="loc-label">現在地を特定しています...</span>
          )}
          {geoStatus === "found" && startNode && (
            <>
              <span className="loc-label">現在地（自動検出）</span>
              <span className="loc-name">{startNode.name}</span>
            </>
          )}
          {geoStatus === "found" && !startNode && (
            <span className="loc-label">近くに登録地点がありません</span>
          )}
          {geoStatus === "denied" && (
            <span className="loc-label">位置情報の使用が許可されていません</span>
          )}
          {geoStatus === "unavailable" && (
            <span className="loc-label">現在地を選択してください</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <select
            className="loc-manual-select"
            value={startId ?? ""}
            onChange={(e) => {
              setStartId(Number(e.target.value) || null);
              setManualStart(true);
            }}
          >
            <option value="">現在地を選択...</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          {manualStart && geoStatus === "found" && (
            <button
              className="loc-auto-btn"
              onClick={() => {
                setManualStart(false);
                if (userLat != null && userLng != null) {
                  const nearest = nearestNode(nodes, userLat, userLng);
                  if (nearest) setStartId(nearest.id);
                }
              }}
            >
              自動検出に戻す
            </button>
          )}
        </div>
      </div>

      <p className="research-note">アプリの利用ログは個人が分からない形で研究に利用される場合があります。</p>

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
        ) : !useAccordion ? (
          <div className="dest-list">
            {grouped[0]?.items.map((n) => <DestCard key={n.id} n={n} />)}
          </div>
        ) : (
          <div className="dest-groups">
            {grouped.map(({ key, label, items }) => (
              <div key={key} className="dest-group">
                <button className="dest-group-heading" onClick={() => toggleGroup(key)}>
                  <span>{label}</span>
                  <span className="dest-group-arrow">{isOpen(key) ? "▲" : "▼"}</span>
                </button>
                {isOpen(key) && (
                  <div className="dest-list">
                    {items.map((n) => <DestCard key={n.id} n={n} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* アンケートへの導線（目的地リストの直下に設置） */}
        <div className="home-survey">
          <SurveyLauncher fallbackUrl={surveyUrl} onOpen={onOpenSurvey} />
        </div>
      </div>
    </div>
  );
};
