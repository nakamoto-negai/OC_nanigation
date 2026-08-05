import React, { useEffect, useMemo, useRef, useState } from "react";
import { Category, Destination, Event, IndoorTransition, Link, MapImage, Node, NodeDetour, RouteResponse, Setting, SuperCategory } from "../types";
import { calcRouteToNodes } from "../utils/dijkstra";
import { api } from "../api/client";
import { SurveyLauncher } from "./SurveyLauncher";
import { RouteGuide } from "./RouteGuide";
import { MapSelector, MapMarker } from "./MapSelector";
import { useCompassPermission } from "../hooks/useCompass";

// 目的地の所属ノードID一覧。
function destNodeIds(d: Destination): number[] {
  return (d.nodes ?? []).map((n) => n.id);
}
// 目的地カードの説明・混雑度に使う代表ノード（所属ノードの先頭）。
// 最小型モデルでは説明・混雑度がノード側にあるため、代表ノードの値を表示する。
function representativeNode(d: Destination): Node | null {
  return d.nodes && d.nodes.length > 0 ? d.nodes[0] : null;
}

const CONGESTION_LABELS = ["", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["", "#22c55e", "#f59e0b", "#ef4444"] as const;

interface Props {
  nodes: Node[];
  links: Link[];
  destinations: Destination[];
  nodeDetours: NodeDetour[];
  indoorTransitions: IndoorTransition[];
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

export const HomePage: React.FC<Props> = ({ nodes, links, destinations, nodeDetours, indoorTransitions, settings, surveyUrl, onOpenSurvey }) => {
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("unavailable");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [startId, setStartId] = useState<number | null>(null);
  const [manualStart, setManualStart] = useState(false);
  // 選択中の目的地ID（Destination.id）。現在地とともに画面上部で選ぶ。
  // 両方揃うとホームに直接 AR 道案内を表示する。
  const [destId, setDestId] = useState<number | null>(null);
  // 目的地セレクト（プルダウン）を押したときに開く、カテゴリ別リストのオーバーレイ。
  const [destPickerOpen, setDestPickerOpen] = useState(false);
  // 目的地オーバーレイのタブ（既存のリスト or マップ）
  const [destTab, setDestTab] = useState<"list" | "map">("list");
  // 現在地を地図から選ぶオーバーレイ
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  // バス停から現在地を選ぶオーバーレイ
  const [busStopPickerOpen, setBusStopPickerOpen] = useState(false);
  // マップ選択用の背景画像（アクティブなマップ）
  const [mapImage, setMapImage] = useState<MapImage | null>(null);
  // 大カテゴリー（イベント選択の最上位見出し用）
  const [superCats, setSuperCats] = useState<SuperCategory[]>([]);
  const [error, setError] = useState("");

  // コンパス（方位）許可。ホーム画面で先に取得しておき、埋め込み道案内へ共有する。
  // iOS は許可要求にユーザー操作（タップ）が必要なため、ホームで「有効にする」ボタンを出して促す。
  // 許可状態だけを購読する（heading の 60fps 更新で HomePage を再レンダリングしない）。
  // heading は埋め込み道案内(RouteGuide)側が useCompass で購読する。
  const compass = useCompassPermission();

  // マップ選択用に、アクティブなマップ画像を取得する。
  useEffect(() => {
    api.mapImages.getActive().then(setMapImage).catch(() => setMapImage(null));
    api.superCategories.list().then(setSuperCats).catch(() => setSuperCats([]));
  }, []);

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
    const d = settings.default_destination_id;
    if (d == null) return;
    const dest = destinations.find((x) => x.id === d);
    if (dest) {
      destInitRef.current = true;
      setDestId(d);
    }
  }, [settings.default_destination_id, destinations]);

  const startNode = nodes.find((n) => n.id === startId) ?? null;
  const destDestination = destinations.find((d) => d.id === destId) ?? null;

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
  const chooseDest = (id: number | null) => {
    setError("");
    setDestPickerOpen(false);
    if (id == null) { setDestId(null); return; }
    if (startId == null) {
      setError("現在地が特定できません。現在地を選択してください。");
      return;
    }
    const dest = destinations.find((d) => d.id === id);
    if (dest && destNodeIds(dest).includes(startId)) {
      setError("現在地と目的地が同じです。");
      return;
    }
    setDestId(id);
  };

  // 現在地と目的地が揃ったらルートを計算し、ホームに埋め込む道案内へ渡す。
  // 目的地に属する複数ノードのうち、現在地から最も近いノードへの経路を求める。
  const inlineRoute = useMemo(() => {
    if (startId == null || destId == null) return null;
    const dest = destinations.find((d) => d.id === destId);
    if (!dest) return null;
    const goalIds = destNodeIds(dest);
    if (goalIds.length === 0 || goalIds.includes(startId)) return null;
    return calcRouteToNodes(nodes, links, startId, goalIds);
  }, [startId, destId, nodes, links, destinations]);

  // 埋め込み道案内内での寄り道・迂回で差し替えられたルート。現在地/目的地が変わったらクリアする。
  const [rerouteOverride, setRerouteOverride] = useState<RouteResponse | null>(null);
  useEffect(() => { setRerouteOverride(null); }, [startId, destId]);
  const activeRoute = rerouteOverride ?? inlineRoute;

  // 目的地は選ばれているのにルートが繋がっていない場合の判定。
  const routeNotFound = startId != null && destId != null && !inlineRoute && (() => {
    const dest = destinations.find((d) => d.id === destId);
    if (!dest) return false;
    const goalIds = destNodeIds(dest);
    return goalIds.length > 0 && !goalIds.includes(startId);
  })();

  // 一覧に出す目的地。ノードが無い目的地や、現在地しか含まない目的地は除外する。
  const visibleDestinations = destinations.filter((d) => {
    const ids = destNodeIds(d);
    return ids.length > 0 && !ids.every((nid) => nid === startId);
  });

  // マップ選択のマーカー。現在地は全ノード、目的地は各目的地の代表ノード位置に置く。
  const startMarkers: MapMarker[] = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, label: n.name }));
  const destMarkers: MapMarker[] = visibleDestinations
    .map((d) => {
      const rep = representativeNode(d);
      return rep ? { id: d.id, x: rep.x, y: rep.y, label: d.name } : null;
    })
    .filter((m): m is MapMarker => m !== null);
  // バス停マーカー: is_bus_stop の目的地の代表ノード位置。id はノードID（現在地に設定するため）。
  const busStopMarkers: MapMarker[] = destinations
    .filter((d) => d.is_bus_stop)
    .map((d) => {
      const rep = representativeNode(d);
      return rep ? { id: rep.id, x: rep.x, y: rep.y, label: d.name } : null;
    })
    .filter((m): m is MapMarker => m !== null);

  // カテゴリ別グループ（Category オブジェクト使用、sort_order 昇順、未設定は末尾）
  type Group = { key: string; label: string; cat: Category | null; items: Destination[] };
  const grouped: Group[] = [];
  const seenIds = new Set<number>();
  const sorted = [...visibleDestinations].sort((a, b) => {
    const ao = a.category?.sort_order ?? Infinity;
    const bo = b.category?.sort_order ?? Infinity;
    if (ao !== bo) return ao - bo;
    const ac = a.category?.id ?? Infinity;
    const bc = b.category?.id ?? Infinity;
    if (ac !== bc) return ac - bc;
    // 同カテゴリ内は目的地の sort_order → id 順
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
  for (const d of sorted) {
    const cat = d.category ?? null;
    const key = cat ? String(cat.id) : "__none__";
    if (!grouped.find((g) => g.key === key)) {
      if (cat && seenIds.has(cat.id)) continue;
      if (cat) seenIds.add(cat.id);
      grouped.push({ key, label: cat?.name ?? "その他", cat, items: [] });
    }
    grouped.find((g) => g.key === key)!.items.push(d);
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
  }, [visibleDestinations.length]);

  const toggleGroup = (key: string) =>
    setOpenKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  const isOpen = (key: string) => openKeys[key] ?? true;

  const useAccordion = grouped.length > 1 || (grouped.length === 1 && grouped[0].key !== "__none__");

  const DestCard = ({ d }: { d: Destination }) => {
    // 説明・混雑度は最小型モデルではノード側にあるため、代表ノード（先頭）の値を表示する。
    const rep = representativeNode(d);
    return (
      <button className={`dest-card${destId === d.id ? " selected" : ""}`} onClick={() => chooseDest(d.id)}>
        <div className="dest-card-inner">
          <div className="dest-card-icon">▶</div>
          <div className="dest-card-info">
            <div className="dest-card-name-row">
              <span className="dest-card-name">{d.name}</span>
              {rep && rep.congestion_level > 0 && (
                <span className="dest-congestion-badge" style={{ background: CONGESTION_COLORS[rep.congestion_level] }}>
                  {CONGESTION_LABELS[rep.congestion_level]}
                </span>
              )}
            </div>
            {rep?.description && <span className="dest-card-desc">{rep.description}</span>}
            {d.events && d.events.length > 0 && (
              <div className="dest-event-marquee" aria-label="開催イベント">
                <div className="dest-event-track">
                  {d.events.map((e) => (
                    <span key={e.id} className="dest-event-item">{e.name}</span>
                  ))}
                  {/* シームレスにループさせるため同じ内容をもう一組並べる */}
                  {d.events.map((e) => (
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
  };

  // カテゴリ別の目的地リスト本体。インライン表示とプルダウンのオーバーレイの両方で使い回す。
  const destListBody =
    destinations.length === 0 ? (
      <p className="dest-empty">管理画面で目的地を登録してください</p>
    ) : visibleDestinations.length === 0 ? (
      <p className="dest-empty">他の目的地がありません</p>
    ) : !useAccordion ? (
      <div className="dest-list">
        {grouped[0]?.items.map((d) => <DestCard key={d.id} d={d} />)}
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
                {items.map((d) => <DestCard key={d.id} d={d} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    );

  // ── イベント選択ビュー用の構造（大カテゴリー → カテゴリー → イベント → 目的地）────────
  // 各イベントを選択肢とし、その下にイベントが開催される目的地を表示する。
  type EventEntry = { event: Event; dest: Destination };
  type EventCatGroup = { key: string; label: string; sort: number; catId: number; entries: EventEntry[] };
  type EventSuperGroup = { key: string; label: string; sort: number; supId: number; cats: EventCatGroup[] };

  const eventSuperGroups = useMemo<EventSuperGroup[]>(() => {
    const sups = new Map<number, EventSuperGroup>();
    const ensureSup = (sup: SuperCategory | null): EventSuperGroup => {
      const id = sup?.id ?? -1;
      if (!sups.has(id)) {
        sups.set(id, {
          key: `evt-sup-${id}`, label: sup?.name ?? "その他",
          sort: sup?.sort_order ?? Number.POSITIVE_INFINITY, supId: id, cats: [],
        });
      }
      return sups.get(id)!;
    };
    const ensureCat = (sg: EventSuperGroup, cat: Category | null): EventCatGroup => {
      const id = cat?.id ?? -1;
      let cg = sg.cats.find((c) => c.catId === id);
      if (!cg) {
        cg = { key: `evt-cat-${id}`, label: cat?.name ?? "その他", sort: cat?.sort_order ?? Number.POSITIVE_INFINITY, catId: id, entries: [] };
        sg.cats.push(cg);
      }
      return cg;
    };
    for (const d of visibleDestinations) {
      if (!d.events || d.events.length === 0) continue;
      const cat = d.category ?? null;
      const supId = cat?.super_category_id ?? null;
      const sup = supId != null ? (superCats.find((s) => s.id === supId) ?? null) : null;
      const sg = ensureSup(sup);
      const cg = ensureCat(sg, cat);
      for (const e of d.events) cg.entries.push({ event: e, dest: d });
    }
    const groups = [...sups.values()];
    groups.sort((a, b) => a.sort - b.sort || a.supId - b.supId);
    for (const g of groups) {
      g.cats.sort((a, b) => a.sort - b.sort || a.catId - b.catId);
      for (const c of g.cats) c.entries.sort((a, b) => (a.event.sort_order - b.event.sort_order) || (a.event.id - b.event.id));
    }
    return groups;
  }, [visibleDestinations, superCats]);

  // イベント選択の本体（大カテゴリー → カテゴリー → イベント（選択肢）→ その下に目的地）
  const eventSelectionBody =
    eventSuperGroups.length === 0 ? (
      <p className="dest-empty">開催イベントが登録された目的地がありません</p>
    ) : (
      <div className="dest-groups">
        {eventSuperGroups.map((sg) => (
          <div key={sg.key} className="dest-group evt-super">
            <button className="dest-group-heading evt-super-heading" onClick={() => toggleGroup(sg.key)}>
              <span>{sg.label}</span>
              <span className="dest-group-arrow">{isOpen(sg.key) ? "▲" : "▼"}</span>
            </button>
            {isOpen(sg.key) && (
              <div className="evt-super-body">
                {sg.cats.map((cg) => (
                  <div key={cg.key} className="dest-group evt-cat">
                    <button className="dest-group-heading evt-cat-heading" onClick={() => toggleGroup(cg.key)}>
                      <span>{cg.label}</span>
                      <span className="dest-group-arrow">{isOpen(cg.key) ? "▲" : "▼"}</span>
                    </button>
                    {isOpen(cg.key) && (
                      <div className="evt-list">
                        {cg.entries.map((en) => (
                          <button
                            key={`${cg.key}-${en.event.id}`}
                            className={`evt-card${destId === en.dest.id ? " selected" : ""}`}
                            onClick={() => chooseDest(en.dest.id)}
                          >
                            <div className="evt-card-name">{en.event.name}</div>
                            <div className="evt-card-dest">
                              <span className="evt-card-dest-label">目的地</span>
                              <span className="evt-card-dest-name">{en.dest.name}</span>
                              <span className="evt-card-arrow">→</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );

  return (
    <div className={`home-page${activeRoute ? " guiding" : ""}`}>
      {/* 行きたい目的地の選択を促す案内。ヘッダー直下に表示する。
          目的地未選択のとき、またはデフォルト目的地が自動選択されているだけのときは表示を維持し、
          ユーザーが自分で目的地を選ぶ（デフォルト以外を選ぶ）と非表示になる。 */}
      {(!activeRoute || destId === settings.default_destination_id) && (
        <p className="home-dest-prompt">自分の行きたい目的地を選択してください</p>
      )}

      {/* コンパス（方位）許可の案内。まだ許可していない間だけ表示し、タップで許可要求する。
          ここで許可しておくと、道案内カメラでコンパスを再度有効にする必要がなくなる。 */}
      {compass.permission === "prompt" && (
        <button className="home-compass-enable" onClick={compass.requestPermission}>
          コンパス（方位）を有効にすると、より正確に道案内できます → 有効にする
        </button>
      )}

      {/* 現在地と目的地を横並び（並列）で表示する */}
      <div className="loc-dest-row">
        {/* 現在地バナー（先に表示する）。目的地バナーと同じ3段構成（ラベル / セレクタ / 選択ボタン2つ）で揃える。 */}
        <div className={`location-banner ${geoStatus}`}>
          <div className="loc-label-row">
            <span className="loc-label">現在地を選択</span>
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
          <div className="loc-mode-btns">
            <button type="button" className="loc-mode-btn" onClick={() => setStartPickerOpen(true)}>
              地図選択
            </button>
            <button type="button" className="loc-mode-btn" onClick={() => setBusStopPickerOpen(true)}>
              バス停選択
            </button>
          </div>
        </div>

        {/* 現在地 → 目的地 の矢印 */}
        <div className="loc-dest-arrow" aria-hidden="true">→</div>

        {/* 目的地バナー（現在地バナーと同じ3段構成） */}
        <div className="dest-banner">
          <div className="loc-label-row">
            <span className="loc-label">目的地を選択</span>
          </div>
          <button
            type="button"
            className="loc-manual-select dest-picker-btn"
            onClick={() => { setDestTab("list"); setDestPickerOpen(true); }}
          >
            <span>{destDestination ? destDestination.name : "目的地を選択..."}</span>
            <span className="dest-picker-caret">▼</span>
          </button>
          {/* プルダウン直下の選択手段ボタン。地図選択＝地図、イベント選択＝リスト（イベント表示付き）。 */}
          <div className="loc-mode-btns">
            <button
              type="button"
              className="loc-mode-btn"
              onClick={() => { setDestTab("map"); setDestPickerOpen(true); }}
            >
              地図選択
            </button>
            <button
              type="button"
              className="loc-mode-btn"
              onClick={() => { setDestTab("list"); setDestPickerOpen(true); }}
            >
              イベント選択
            </button>
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
          indoorTransitions={indoorTransitions}
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

      {/* 目的地選択オーバーレイ。destTab（イベント選択=リスト / 地図選択=マップ）で表示を切替。
          モードはプルダウン直下の「地図選択」「イベント選択」ボタンで指定して開く。 */}
      {destPickerOpen && (
        <div className="dest-modal-overlay" onClick={() => setDestPickerOpen(false)}>
          <div className="dest-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dest-modal-head">
              <h2 className="dest-heading">{destTab === "list" ? "イベントから選ぶ" : "目的地を選んでください"}</h2>
              <button
                className="dest-modal-close"
                onClick={() => setDestPickerOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="dest-modal-body">
              {destTab === "list" ? (
                eventSelectionBody
              ) : (
                <MapSelector
                  mapImage={mapImage}
                  markers={destMarkers}
                  selectedId={destId}
                  onSelect={(id) => chooseDest(id)}
                  emptyText="マップ画像が未登録です。イベント選択から選んでください。"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 現在地を地図から選ぶオーバーレイ */}
      {startPickerOpen && (
        <div className="dest-modal-overlay" onClick={() => setStartPickerOpen(false)}>
          <div className="dest-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dest-modal-head">
              <h2 className="dest-heading">現在地を地図から選択</h2>
              <button
                className="dest-modal-close"
                onClick={() => setStartPickerOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="dest-modal-body">
              <MapSelector
                mapImage={mapImage}
                markers={startMarkers}
                selectedId={startId}
                hideLabels
                onSelect={(id) => {
                  setStartId(id);
                  setManualStart(true);
                  setStartPickerOpen(false);
                }}
                emptyText="マップ画像が未登録です。上の一覧から選択してください。"
              />
            </div>
          </div>
        </div>
      )}

      {/* バス停から現在地を選ぶオーバーレイ（is_bus_stop の目的地だけを地図に表示） */}
      {busStopPickerOpen && (
        <div className="dest-modal-overlay" onClick={() => setBusStopPickerOpen(false)}>
          <div className="dest-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dest-modal-head">
              <h2 className="dest-heading">バス停から現在地を選択</h2>
              <button
                className="dest-modal-close"
                onClick={() => setBusStopPickerOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="dest-modal-body">
              {busStopMarkers.length === 0 ? (
                <p className="dest-empty">バス停が登録されていません（管理画面の目的地で「バス停にする」をONにしてください）。</p>
              ) : (
                <MapSelector
                  mapImage={mapImage}
                  markers={busStopMarkers}
                  selectedId={startId}
                  onSelect={(nodeId) => {
                    setStartId(nodeId);
                    setManualStart(true);
                    setBusStopPickerOpen(false);
                  }}
                  emptyText="マップ画像が未登録です。"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
