import React, { useEffect, useMemo, useRef, useState } from "react";
import { Category, Link, Node, NodeDetour, RouteResponse, Setting } from "../types";
import { calcRoute } from "../utils/dijkstra";
import { SurveyLauncher } from "./SurveyLauncher";
import { RouteGuide } from "./RouteGuide";

const CONGESTION_LABELS = ["", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["", "#22c55e", "#f59e0b", "#ef4444"] as const;

interface Props {
  nodes: Node[];
  links: Link[];
  nodeDetours: NodeDetour[];
  settings: Setting;
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

export const HomePage: React.FC<Props> = ({ nodes, links, nodeDetours, settings, surveyUrl, onOpenSurvey }) => {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("unavailable");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [startId, setStartId] = useState<number | null>(null);
  const [manualStart, setManualStart] = useState(false);
  // 目的地。現在地とともに画面上部で選ぶ。両方揃うとホームに直接 AR 道案内を表示する。
  const [destId, setDestId] = useState<number | null>(null);
  // 目的地セレクト（プルダウン）を押したときに開く、カテゴリ別リストのオーバーレイ。
  const [destPickerOpen, setDestPickerOpen] = useState(false);
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

  // 管理画面で設定したデフォルト目的地を、起動時に一度だけ初期選択する。
  // ユーザーが以降で目的地を変更・解除しても再適用しない。
  const destInitRef = useRef(false);
  useEffect(() => {
    if (destInitRef.current) return;
    const d = settings.default_dest_node_id;
    if (d == null) return;
    const node = nodes.find((n) => n.id === d);
    if (node && node.is_selectable) {
      destInitRef.current = true;
      setDestId(d);
    }
  }, [settings.default_dest_node_id, nodes]);

  const startNode = nodes.find((n) => n.id === startId) ?? null;
  const destNode = nodes.find((n) => n.id === destId) ?? null;

  // 現在地を取り直す（GPS を最新の値で再取得し、自動検出に戻す）。
  const reloadLocation = () => {
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }
    setManualStart(false);
    setGeoStatus("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setGeoStatus("found");
      },
      (err) => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };

  // 目的地を選ぶ（上部セレクト・目的地リストの両方から呼ぶ）。現在地が未確定なら促す。
  const chooseDest = (goalId: number | null) => {
    setError("");
    setDestPickerOpen(false);
    if (goalId == null) { setDestId(null); return; }
    if (startId == null) {
      setError("現在地が特定できません。現在地を選択してください。");
      return;
    }
    if (startId === goalId) {
      setError("現在地と目的地が同じです。");
      return;
    }
    setDestId(goalId);
  };

  // 現在地と目的地が揃ったらルートを計算し、ホームに埋め込む道案内へ渡す。
  const inlineRoute = useMemo(() => {
    if (startId == null || destId == null || startId === destId) return null;
    return calcRoute(nodes, links, startId, destId);
  }, [startId, destId, nodes, links]);

  // 埋め込み道案内内での寄り道・迂回で差し替えられたルート。現在地/目的地が変わったらクリアする。
  const [rerouteOverride, setRerouteOverride] = useState<RouteResponse | null>(null);
  useEffect(() => { setRerouteOverride(null); }, [startId, destId]);
  const activeRoute = rerouteOverride ?? inlineRoute;

  // 目的地は選ばれているのにルートが繋がっていない場合の判定。
  const routeNotFound = startId != null && destId != null && startId !== destId && !inlineRoute;

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
    <button className={`dest-card${destId === n.id ? " selected" : ""}`} onClick={() => chooseDest(n.id)}>
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

  // カテゴリ別の目的地リスト本体。インライン表示とプルダウンのオーバーレイの両方で使い回す。
  const destListBody =
    nodes.length === 0 ? (
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
    );

  return (
    <div className={`home-page${activeRoute ? " guiding" : ""}`}>
      {/* 現在地と目的地を横並び（並列）で表示する */}
      <div className="loc-dest-row">
        {/* 目的地バナー（現在地より先に表示する） */}
        <div className="dest-banner">
          <div className="loc-text">
            <span className="loc-label">自分の行きたい目的地を選択してください</span>
            {destNode && <span className="loc-name">{destNode.name}</span>}
          </div>
          <button
            type="button"
            className="loc-manual-select dest-picker-btn"
            onClick={() => setDestPickerOpen(true)}
          >
            <span>{destNode ? destNode.name : "目的地を選択..."}</span>
            <span className="dest-picker-caret">▼</span>
          </button>
        </div>

        {/* 現在地バナー */}
        <div className={`location-banner ${geoStatus}`}>
          <div className="loc-text">
            <div className="loc-label-row">
              <span className="loc-label">
                {geoStatus === "pending"
                  ? "現在地を特定しています..."
                  : geoStatus === "found"
                  ? (startNode ? "現在地（自動検出）" : "近くに登録地点がありません")
                  : geoStatus === "denied"
                  ? "位置情報の使用が許可されていません"
                  : "現在地を選択してください"}
              </span>
              <button
                type="button"
                className="loc-reload-btn"
                onClick={reloadLocation}
                disabled={geoStatus === "pending"}
                aria-label="現在地を再読み込み"
                title="現在地を再読み込み"
              >
                <span className="loc-reload-icon">↻</span>
                <span className="loc-reload-text">再読み込み</span>
              </button>
            </div>
            {geoStatus === "found" && startNode && (
              <span className="loc-name">{startNode.name}</span>
            )}
          </div>
          <div className="loc-select-group">
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
      </div>

      {error && (
        <div className="home-error" onClick={() => setError("")}>{error} ✕</div>
      )}

      {routeNotFound && (
        <div className="home-error">ルートが見つかりませんでした。別の目的地を選んでください。</div>
      )}

      {/* 現在地＋目的地が揃ったら、ホームに道案内（カードスクロール＋AR）を埋め込む */}
      {activeRoute ? (
        <RouteGuide
          key={`${startId}-${destId}`}
          route={activeRoute}
          nodes={nodes}
          links={links}
          nodeDetours={nodeDetours}
          settings={settings}
          onReroute={(r) => setRerouteOverride(r)}
          onClose={() => { setDestId(null); setRerouteOverride(null); }}
          onOpenSurvey={onOpenSurvey}
          embedded
        />
      ) : (
        <>
      <p className="research-note">アプリの利用ログは個人が分からない形で研究に利用される場合があります。</p>

      {/* 目的地リスト */}
      <div className="dest-section">
        <h2 className="dest-heading">目的地を選んでください</h2>
        {destListBody}

        {/* アンケートへの導線（目的地リストの直下に設置） */}
        <div className="home-survey">
          <SurveyLauncher fallbackUrl={surveyUrl} onOpen={onOpenSurvey} />
        </div>
      </div>
        </>
      )}

      {/* 目的地プルダウンを押したときのオーバーレイ（目的地選択画面と同じリスト） */}
      {destPickerOpen && (
        <div className="dest-modal-overlay" onClick={() => setDestPickerOpen(false)}>
          <div className="dest-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dest-modal-head">
              <h2 className="dest-heading">目的地を選んでください</h2>
              <button
                className="dest-modal-close"
                onClick={() => setDestPickerOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="dest-modal-body">{destListBody}</div>
          </div>
        </div>
      )}
    </div>
  );
};
