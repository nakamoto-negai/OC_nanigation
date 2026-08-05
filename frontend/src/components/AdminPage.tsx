import React, { useEffect, useRef, useState } from "react";
import { ArrivalPhoto, ARFeature, ARObject, Cafeteria, Category, Destination, Event, IndoorTransition, Link, MapImage, Node, NodeDetour, OverlayImage, Photo, SurveyQuestion, SurveyResponse, UserLog } from "../types";
import { api } from "../api/client";
import { CAFETERIA_CONGESTION_LABELS, CAFETERIA_CONGESTION_COLORS } from "../utils/congestion";
import { useAdminWS, UserPosition } from "../hooks/useAdminWS";
import { getDeviceId } from "../hooks/useUser";
import { ARRecognizer } from "./ARRecognizer";
import { ARDemoTab } from "./ARDemoTab";
import { AnnouncementTab } from "./AnnouncementTab";
import { ArrivalPhotoManager } from "./ArrivalPhotoManager";
import { CompositeEditor } from "./CompositeEditor";
import { CompositeTab } from "./CompositeTab";
import { toCsv, downloadCsv, csvTimestamp } from "../utils/csv";

interface Props {
  nodes: Node[];
  links: Link[];
  onNodeCreated: (node: Node) => void;
  onNodeUpdated: (node: Node) => void;
  onNodeDeleted: (id: number) => void;
  onLinkCreated: (link: Link) => void;
  onLinkUpdated: (link: Link) => void;
  onLinkDeleted: (id: number) => void;
  onPhotoUploaded: (linkId: number, photo: Photo) => void;
  onPhotoDeleted: (linkId: number, photoId: number) => void;
  onPhotoReordered: (linkId: number, photos: Photo[]) => void;
}

type Tab = "node" | "destination" | "link" | "detour" | "indoor" | "photo" | "overlay" | "composite" | "cafeteria" | "settings" | "users" | "logs" | "category" | "ar" | "survey" | "event" | "demo" | "announce";

const BASE = import.meta.env.VITE_API_URL ?? "";

// ── Map Picker ───────────────────────────────────────────────────────────────

function MapPicker({
  nodes, editingNodeId, pendingX, pendingY, mapImage, onPick,
}: {
  nodes: Node[];
  editingNodeId: number | null;
  pendingX: number | null;
  pendingY: number | null;
  mapImage: MapImage;
  onPick: (x: number, y: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(mapImage.width || 0);
  const [naturalH, setNaturalH] = useState(mapImage.height || 0);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = imgRef.current;
    if (!img || !naturalW || !naturalH) return;
    const rect = img.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * naturalW);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * naturalH);
    onPick(x, y);
  };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="map-picker" onClick={handleClick}>
      <img
        ref={imgRef}
        src={`${BASE}${mapImage.url}`}
        alt={mapImage.name}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          setNaturalW(img.naturalWidth);
          setNaturalH(img.naturalHeight);
        }}
      />
      {naturalW > 0 && naturalH > 0 && (
        <>
          {nodes.map((n) => (
            <div
              key={n.id}
              className={`map-node-dot${n.id === editingNodeId ? " editing" : ""}`}
              style={{ left: pct(n.x, naturalW), top: pct(n.y, naturalH) }}
              title={n.name}
            />
          ))}
          {pendingX != null && pendingY != null && (
            <div
              className="map-pending-dot"
              style={{ left: pct(pendingX, naturalW), top: pct(pendingY, naturalH) }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Congestion ───────────────────────────────────────────────────────────────

const CONGESTION_LABELS = ["不明", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["#94a3b8", "#22c55e", "#f59e0b", "#ef4444"] as const;

function CongestionBadge({ level }: { level: number }) {
  const label = CONGESTION_LABELS[level] ?? "不明";
  const color = CONGESTION_COLORS[level] ?? CONGESTION_COLORS[0];
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 12,
      background: color, color: "white", fontSize: 11, fontWeight: 700,
    }}>{label}</span>
  );
}

// ── Node Form ────────────────────────────────────────────────────────────────

interface NodeFormState {
  id: number | null;
  name: string;
  description: string;
  x: string;
  y: string;
  lat: string;
  lng: string;
  congestionLevel: number;
  waitTime: string;
}

const emptyNode = (): NodeFormState => ({
  id: null, name: "", description: "", x: "", y: "", lat: "", lng: "", congestionLevel: 0, waitTime: "0",
});

function NodeTab({
  nodes,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  nodes: Node[];
  onCreated: (n: Node) => void;
  onUpdated: (n: Node) => void;
  onDeleted: (id: number) => void;
}) {
  const [form, setForm] = useState<NodeFormState>(emptyNode());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [fillGeo, setFillGeo] = useState(false);
  const [mapImage, setMapImage] = useState<MapImage | null>(null);

  useEffect(() => {
    api.mapImages.getActive().then(setMapImage).catch(() => setMapImage(null));
  }, []);

  const set = (k: keyof NodeFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const fillCurrentGeo = () => {
    if (!navigator.geolocation) return;
    setFillGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
        }));
        setFillGeo(false);
      },
      () => {
        setMsg({ type: "err", text: "位置情報の取得に失敗しました" });
        setFillGeo(false);
      }
    );
  };

  const validate = () => {
    if (!form.name.trim()) return "名前は必須です";
    if (form.x === "" || form.y === "") return "マップX・Y座標は必須です";
    if (isNaN(Number(form.x)) || isNaN(Number(form.y))) return "座標は数値で入力してください";
    if (form.lat !== "" && isNaN(Number(form.lat))) return "緯度は数値で入力してください";
    if (form.lng !== "" && isNaN(Number(form.lng))) return "経度は数値で入力してください";
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { setMsg({ type: "err", text: err }); return; }
    setSaving(true);
    try {
      const data: Partial<Node> = {
        name: form.name.trim(),
        description: form.description.trim(),
        x: Number(form.x),
        y: Number(form.y),
        lat: form.lat !== "" ? Number(form.lat) : null,
        lng: form.lng !== "" ? Number(form.lng) : null,
        congestion_level: form.congestionLevel,
        wait_time: Number(form.waitTime) || 0,
      };
      if (form.id) {
        const updated = await api.nodes.update(form.id, data);
        onUpdated(updated);
        setMsg({ type: "ok", text: `「${updated.name}」を更新しました` });
      } else {
        const created = await api.nodes.create(data);
        onCreated(created);
        setMsg({ type: "ok", text: `「${created.name}」を追加しました` });
      }
      setForm(emptyNode());
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (n: Node) => {
    setForm({
      id: n.id, name: n.name, description: n.description,
      x: String(n.x), y: String(n.y),
      lat: n.lat != null ? String(n.lat) : "",
      lng: n.lng != null ? String(n.lng) : "",
      congestionLevel: n.congestion_level,
      waitTime: String(n.wait_time),
    });
    setMsg(null);
  };

  const del = async (id: number, name: string) => {
    if (!window.confirm(`「${name}」を削除しますか？\n関連するリンクも削除されます。`)) return;
    try {
      await api.nodes.delete(id);
      onDeleted(id);
      setMsg({ type: "ok", text: `「${name}」を削除しました` });
      if (form.id === id) setForm(emptyNode());
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>{form.id ? "ノードを編集" : "ノードを追加"}</h3>
        {msg && (
          <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
            {msg.text} ✕
          </div>
        )}
        <div className="adm-field">
          <label>名前 <span className="req">*</span></label>
          <input value={form.name} onChange={set("name")} placeholder="例: 入口" />
        </div>
        <div className="adm-field">
          <label>説明</label>
          <textarea value={form.description} onChange={set("description")} placeholder="場所の説明など" rows={2} />
          <p className="hint">説明・混雑度は、この地点が目的地の到達地点になったときにゴールカードや目的地カードに表示されます。カテゴリ・イベント・目的地としての表示は「目的地」タブで管理します。</p>
        </div>

        <div className="adm-section-label">
          マップ表示座標
          {mapImage && <span className="adm-section-sub">右のマップをクリックして配置</span>}
        </div>
        <div className="adm-field-row">
          <div className="adm-field">
            <label>X <span className="req">*</span></label>
            <input type="number" value={form.x} onChange={set("x")} placeholder="例: 300" />
          </div>
          <div className="adm-field">
            <label>Y <span className="req">*</span></label>
            <input type="number" value={form.y} onChange={set("y")} placeholder="例: 200" />
          </div>
        </div>

        <div className="adm-section-label">
          GPS座標
          <span className="adm-section-sub">（位置情報で自動特定するのに使用）</span>
        </div>
        <div className="adm-field-row">
          <div className="adm-field">
            <label>緯度 (lat)</label>
            <input type="number" step="0.00001" value={form.lat} onChange={set("lat")} placeholder="例: 35.68123" />
          </div>
          <div className="adm-field">
            <label>経度 (lng)</label>
            <input type="number" step="0.00001" value={form.lng} onChange={set("lng")} placeholder="例: 139.76711" />
          </div>
        </div>
        <button className="btn-geo" onClick={fillCurrentGeo} disabled={fillGeo}>
          {fillGeo ? "取得中..." : "現在地の座標を入力"}
        </button>

        <div className="adm-field-row" style={{ marginTop: 12 }}>
          <div className="adm-field">
            <label>混雑度</label>
            <select
              value={form.congestionLevel}
              onChange={(e) => setForm((f) => ({ ...f, congestionLevel: Number(e.target.value) }))}
            >
              <option value={0}>不明</option>
              <option value={1}>空き</option>
              <option value={2}>普通</option>
              <option value={3}>混雑</option>
            </select>
          </div>
          <div className="adm-field">
            <label>待ち時間（分）</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.waitTime}
              onChange={(e) => setForm((f) => ({ ...f, waitTime: e.target.value }))}
              placeholder="0"
            />
          </div>
        </div>

        <div className="adm-actions" style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "保存中..." : form.id ? "更新" : "追加"}
          </button>
          {form.id && (
            <button className="btn-secondary" onClick={() => { setForm(emptyNode()); setMsg(null); }}>
              キャンセル
            </button>
          )}
        </div>
      </div>

      <div className="adm-list-col">
        {mapImage ? (
          <MapPicker
            nodes={nodes}
            editingNodeId={form.id}
            pendingX={form.x !== "" ? Number(form.x) : null}
            pendingY={form.y !== "" ? Number(form.y) : null}
            mapImage={mapImage}
            onPick={(x, y) => setForm((f) => ({ ...f, x: String(x), y: String(y) }))}
          />
        ) : (
          <p className="adm-empty" style={{ marginBottom: 12 }}>
            「設定」タブからマップ画像をアップロードすると、クリックでノードを配置できます
          </p>
        )}
        <h3>ノード一覧 <span className="count-badge">{nodes.length}</span></h3>
        {nodes.length > 0 && (() => {
          const withGps = nodes.filter((n) => n.lat != null && n.lng != null).length;
          const missing = nodes.length - withGps;
          return (
            <p className="hint" style={{ marginBottom: 8 }}>
              GPS座標 登録済み {withGps} / {nodes.length} ノード（未登録 <strong style={{ color: missing > 0 ? "#ef4444" : "#16a34a" }}>{missing}</strong> 件）。未登録の行は赤く表示されます。
            </p>
          );
        })()}
        {nodes.length === 0 ? (
          <p className="adm-empty">ノードがまだありません</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>名前</th><th>説明</th>
                <th>X</th><th>Y</th>
                <th>緯度</th><th>経度</th>
                <th>GPS</th>
                <th>混雑度</th>
                <th>待ち時間</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => {
                const hasGps = n.lat != null && n.lng != null;
                return (
                <tr key={n.id} className={`${form.id === n.id ? "editing" : ""}${hasGps ? "" : " no-gps"}`}>
                  <td><strong>{n.name}</strong></td>
                  <td className="text-muted">{n.description || "—"}</td>
                  <td className="num">{Math.round(n.x)}</td>
                  <td className="num">{Math.round(n.y)}</td>
                  <td className="num">{n.lat != null ? n.lat.toFixed(5) : <span className="text-muted">—</span>}</td>
                  <td className="num">{n.lng != null ? n.lng.toFixed(5) : <span className="text-muted">—</span>}</td>
                  <td className="center">{hasGps ? "✓" : <span className="photo-missing">未登録</span>}</td>
                  <td className="center"><CongestionBadge level={n.congestion_level} /></td>
                  <td className="num">{n.wait_time > 0 ? `${n.wait_time}分` : <span className="text-muted">—</span>}</td>
                  <td className="adm-row-actions">
                    <button className="btn-edit" onClick={() => startEdit(n)}>編集</button>
                    <button className="btn-del" onClick={() => del(n.id, n.name)}>削除</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Link Form ────────────────────────────────────────────────────────────────

interface LinkFormState {
  id: number | null;
  fromNodeId: number | "";
  toNodeId: number | "";
  name: string;
  description: string;
  distance: string;
}

const emptyLink = (): LinkFormState => ({
  id: null, fromNodeId: "", toNodeId: "", name: "", description: "", distance: "1",
});

function LinkTab({
  nodes,
  links,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  nodes: Node[];
  links: Link[];
  onCreated: (l: Link) => void;
  onUpdated: (l: Link) => void;
  onDeleted: (id: number) => void;
}) {
  const [form, setForm] = useState<LinkFormState>(emptyLink());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const set = (k: keyof LinkFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    if (form.fromNodeId === "" || form.toNodeId === "") return "FromとToを選択してください";
    if (form.fromNodeId === form.toNodeId) return "FromとToに同じノードは選べません";
    if (!form.distance || Number(form.distance) <= 0) return "距離は0より大きい値を入力してください";
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { setMsg({ type: "err", text: err }); return; }
    setSaving(true);
    try {
      const data = {
        from_node_id: Number(form.fromNodeId),
        to_node_id: Number(form.toNodeId),
        name: form.name.trim(),
        description: form.description.trim(),
        distance: parseFloat(form.distance),
      };
      if (form.id) {
        const updated = await api.links.update(form.id, data);
        onUpdated(updated);
        setMsg({ type: "ok", text: "リンクを更新しました" });
      } else {
        const created = await api.links.create(data);
        onCreated(created);
        setMsg({ type: "ok", text: "リンクを追加しました" });
      }
      setForm(emptyLink());
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (l: Link) => {
    setForm({
      id: l.id,
      fromNodeId: l.from_node_id,
      toNodeId: l.to_node_id,
      name: l.name,
      description: l.description,
      distance: String(l.distance),
    });
    setMsg(null);
  };

  const del = async (id: number) => {
    if (!window.confirm("このリンクを削除しますか？\n関連する写真も削除されます。")) return;
    try {
      await api.links.delete(id);
      onDeleted(id);
      setMsg({ type: "ok", text: "リンクを削除しました" });
      if (form.id === id) setForm(emptyLink());
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  const nodeName = (id: number | "") => nodes.find((n) => n.id === id)?.name ?? "—";

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>{form.id ? "リンクを編集" : "リンクを追加"}</h3>
        {msg && (
          <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
            {msg.text} ✕
          </div>
        )}
        <div className="adm-field-row">
          <div className="adm-field">
            <label>From ノード <span className="req">*</span></label>
            <select value={form.fromNodeId} onChange={set("fromNodeId")}>
              <option value="">選択してください</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
          <div className="adm-field arrow-field">→</div>
          <div className="adm-field">
            <label>To ノード <span className="req">*</span></label>
            <select value={form.toNodeId} onChange={set("toNodeId")}>
              <option value="">選択してください</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        </div>
        <div className="adm-field">
          <label>リンク名</label>
          <input value={form.name} onChange={set("name")} placeholder="例: メインロビー、階段" />
        </div>
        <div className="adm-field">
          <label>説明</label>
          <textarea value={form.description} onChange={set("description")} placeholder="経路の説明など" rows={2} />
        </div>
        <div className="adm-field-row">
          <div className="adm-field">
            <label>距離 <span className="req">*</span></label>
            <input type="number" value={form.distance} onChange={set("distance")} min="0.1" step="0.1" />
          </div>
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "保存中..." : form.id ? "更新" : "追加"}
          </button>
          {form.id && (
            <button className="btn-secondary" onClick={() => { setForm(emptyLink()); setMsg(null); }}>
              キャンセル
            </button>
          )}
        </div>
      </div>

      <div className="adm-list-col">
        <h3>リンク一覧 <span className="count-badge">{links.length}</span></h3>
        {links.length === 0 ? (
          <p className="adm-empty">リンクがまだありません</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr><th>From</th><th></th><th>To</th><th>名前</th><th>距離</th><th>写真</th><th></th></tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} className={form.id === l.id ? "editing" : ""}>
                  <td><strong>{nodeName(l.from_node_id)}</strong></td>
                  <td className="text-muted">→</td>
                  <td><strong>{nodeName(l.to_node_id)}</strong></td>
                  <td>{l.name || "—"}</td>
                  <td className="num">{l.distance}</td>
                  <td className="center">{l.photos?.length ?? 0}枚</td>
                  <td className="adm-row-actions">
                    <button className="btn-edit" onClick={() => startEdit(l)}>編集</button>
                    <button className="btn-del" onClick={() => del(l.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Photo Tab ────────────────────────────────────────────────────────────────

// 2点間の距離(m)。Haversine。
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// リンクの現在地からの距離。両端ノードのGPSのうち最も近い方を採用。GPS未登録は Infinity。
function linkDistanceM(link: Link, lat: number, lng: number): number {
  let best = Infinity;
  for (const n of [link.from_node, link.to_node]) {
    if (n && n.lat != null && n.lng != null) {
      best = Math.min(best, haversineM(lat, lng, n.lat, n.lng));
    }
  }
  return best;
}

function formatDistance(d: number): string {
  if (!isFinite(d)) return "GPS無";
  return d < 1000 ? `約${Math.round(d)}m` : `約${(d / 1000).toFixed(2)}km`;
}

function PhotoTab({
  links,
  onUploaded,
  onDeleted,
  onReordered,
  onLinkUpdated,
}: {
  links: Link[];
  onUploaded: (linkId: number, photo: Photo) => void;
  onDeleted: (linkId: number, photoId: number) => void;
  onReordered: (linkId: number, photos: Photo[]) => void;
  onLinkUpdated: (link: Link) => void;
}) {
  const [selectedLinkId, setSelectedLinkId] = useState<number | "">("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // 一覧の「写真」「カメラ」ボタンで追加する対象: 道中写真 / 到着地点の写真
  const [addTarget, setAddTarget] = useState<"photo" | "arrival">("photo");
  // 現在地から近い順に並べる機能の状態
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "pending" | "denied" | "unavailable">("idle");
  const [sortByDistance, setSortByDistance] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // 合成エディタで編集中の道中写真（null なら閉じている）
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  // アップロード対象リンク（一覧の「写真」「カメラ」ボタンで開いた選択の保存先）
  const uploadTargetRef = useRef<number | null>(null);

  const selectedLink = links.find((l) => l.id === selectedLinkId);

  // 選んだ画像を、対象リンクの「道中写真」または「到着地点の写真」として末尾に追加する。
  const doUpload = async (fileList: File[]) => {
    const linkId = uploadTargetRef.current;
    if (linkId == null || fileList.length === 0) return;
    const link = links.find((l) => l.id === linkId);
    setUploading(true);
    setMsg(null);
    try {
      if (addTarget === "arrival") {
        // 到着地点の写真として追加し、親のリンク状態を更新（一覧の件数を即反映）。
        const base = link?.arrival_photos?.length ?? 0;
        const added: ArrivalPhoto[] = [];
        for (let i = 0; i < fileList.length; i++) {
          const form = new FormData();
          form.append("photo", fileList[i]);
          form.append("link_id", String(linkId));
          form.append("sort_order", String(base + i));
          added.push(await api.arrivalPhotos.upload(form));
        }
        if (link) onLinkUpdated({ ...link, arrival_photos: [...(link.arrival_photos ?? []), ...added] });
        setMsg({ type: "ok", text: `到着写真を${fileList.length}枚追加しました` });
      } else {
        // 道中写真として追加。
        const base = link?.photos?.length ?? 0;
        for (let i = 0; i < fileList.length; i++) {
          const form = new FormData();
          form.append("photo", fileList[i]);
          form.append("link_id", String(linkId));
          form.append("sort_order", String(base + i));
          const photo = await api.photos.upload(form);
          onUploaded(linkId, photo);
        }
        setMsg({ type: "ok", text: `道中写真を${fileList.length}枚追加しました` });
      }
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setUploading(false);
    }
  };

  // 一覧の各行の「写真」「カメラ」ボタン: そのリンクを対象にして選択ダイアログを開く。
  const openPicker = (linkId: number, camera: boolean) => {
    uploadTargetRef.current = linkId;
    setSelectedLinkId(linkId);
    (camera ? cameraRef : fileRef).current?.click();
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    doUpload(Array.from(e.target.files ?? []));
    if (fileRef.current) fileRef.current.value = "";
  };
  const onCameraPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) doUpload([f]);
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const del = async (photo: Photo) => {
    if (!window.confirm("この写真を削除しますか？")) return;
    try {
      await api.photos.delete(photo.id);
      onDeleted(Number(selectedLinkId), photo.id);
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!selectedLink) return;
    const next = [...photos];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    const orders = next.map((p, i) => ({ id: p.id, order: i }));
    try {
      await api.photos.reorder(orders);
      onReordered(selectedLink.id, next.map((p, i) => ({ ...p, sort_order: i })));
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  const photos = selectedLink
    ? [...(selectedLink.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    : [];

  const linkLabel = (l: Link) =>
    `${l.from_node?.name ?? l.from_node_id} → ${l.to_node?.name ?? l.to_node_id}${l.name ? ` (${l.name})` : ""}`;

  // その場で現在地(GPS)を取得し、近い順ソートを有効にする。
  const locateAndSort = () => {
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }
    setGeoStatus("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSortByDistance(true);
        setGeoStatus("idle");
      },
      (err) => setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };

  // 表示用リンク。近い順ソートが有効なら現在地からの距離で昇順（GPS未登録は末尾、元の順を維持）。
  const displayLinks = (sortByDistance && userPos)
    ? links
        .map((l, i) => ({ l, i, d: linkDistanceM(l, userPos.lat, userPos.lng) }))
        .sort((a, b) => (a.d !== b.d ? a.d - b.d : a.i - b.i))
        .map((x) => x.l)
    : links;

  return (
    <div className="adm-list-col">
      {/* 共有の隠しファイル/カメラ入力（一覧の各行から使う） */}
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onFilePick} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onCameraPick} />

      <h3>リンク写真の一覧 <span className="count-badge">{links.length}</span></h3>
      {msg && (
        <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>
      )}
      {(() => {
        const withPhoto = links.filter((l) => (l.photos?.length ?? 0) > 0).length;
        const missing = links.length - withPhoto;
        return (
          <p className="hint" style={{ marginBottom: 8 }}>
            道中写真あり {withPhoto} / {links.length} リンク（未撮影 <strong style={{ color: missing > 0 ? "#ef4444" : "#16a34a" }}>{missing}</strong> 件）。各行の「写真」「カメラ」から直接追加できます。行をクリックすると下に写真を表示します。
          </p>
        );
      })()}
      {/* 追加先の選択: 各行の「写真」「カメラ」ボタンがどちらに追加するか */}
      <div className="add-target-row">
        <span className="add-target-label">追加先:</span>
        <button
          type="button"
          className={`add-target-btn${addTarget === "photo" ? " active" : ""}`}
          onClick={() => setAddTarget("photo")}
        >
          道中写真
        </button>
        <button
          type="button"
          className={`add-target-btn${addTarget === "arrival" ? " active" : ""}`}
          onClick={() => setAddTarget("arrival")}
        >
          到着地点の写真
        </button>
      </div>

      {/* 現在地を取得して近い順に並べる */}
      <div className="add-target-row">
        <button type="button" className="btn-secondary" onClick={locateAndSort} disabled={geoStatus === "pending"}>
          {geoStatus === "pending" ? "現在地を取得中..." : "現在地から近い順に並べる"}
        </button>
        {sortByDistance && userPos && (
          <button type="button" className="add-target-btn active" onClick={() => setSortByDistance(false)}>
            元の順に戻す
          </button>
        )}
        {geoStatus === "denied" && <span className="photo-missing">位置情報が許可されていません</span>}
        {geoStatus === "unavailable" && <span className="photo-missing">現在地を取得できません</span>}
        {sortByDistance && userPos && (
          <span className="hint" style={{ margin: 0 }}>現在地に近い順（両端ノードのGPS）。GPS未登録のリンクは末尾。</span>
        )}
      </div>

      {links.length === 0 ? (
        <p className="adm-empty">リンクがまだありません</p>
      ) : (
        <table className="adm-table photo-overview">
          <thead>
            <tr><th>経路</th>{sortByDistance && userPos && <th>距離</th>}<th>道中</th><th>到着</th><th>写真追加</th></tr>
          </thead>
          <tbody>
            {displayLinks.map((l) => {
              const cnt = l.photos?.length ?? 0;
              const arr = l.arrival_photos?.length ?? 0;
              const dist = (sortByDistance && userPos) ? linkDistanceM(l, userPos.lat, userPos.lng) : null;
              return (
                <tr
                  key={l.id}
                  className={`${selectedLinkId === l.id ? "editing" : ""}${cnt === 0 ? " no-photo" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedLinkId(l.id)}
                >
                  <td>
                    <strong>{l.from_node?.name ?? l.from_node_id} → {l.to_node?.name ?? l.to_node_id}</strong>
                    {l.name ? <span className="text-muted"> ({l.name})</span> : null}
                  </td>
                  {dist != null && (
                    <td className="center">
                      {isFinite(dist) ? formatDistance(dist) : <span className="text-muted">GPS無</span>}
                    </td>
                  )}
                  <td className="center">
                    {cnt === 0 ? <span className="photo-missing">未撮影</span> : `${cnt}枚`}
                  </td>
                  <td className="center">{arr > 0 ? `${arr}枚` : <span className="text-muted">—</span>}</td>
                  <td className="center" onClick={(e) => e.stopPropagation()}>
                    <button className="photo-add-btn" disabled={uploading} onClick={() => openPicker(l.id, false)}>写真</button>
                    <button className="photo-add-btn" disabled={uploading} onClick={() => openPicker(l.id, true)}>カメラ</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* 選択中リンクの道中写真（追加・並び替え・合成・削除）＋到着写真 */}
      {selectedLink && (
        <div style={{ marginTop: 12 }}>
          <h3>
            選択中: {linkLabel(selectedLink)} <span className="count-badge">{photos.length}枚</span>
          </h3>
          <div className="arrival-photo-btns" style={{ marginBottom: 10 }}>
            <button type="button" className="btn-primary" disabled={uploading} onClick={() => openPicker(selectedLink.id, true)}>
              {uploading ? "アップロード中..." : "カメラで撮影して追加"}
            </button>
            <button type="button" className="btn-secondary" disabled={uploading} onClick={() => openPicker(selectedLink.id, false)}>
              写真を選んで追加
            </button>
          </div>
          {photos.length === 0 ? (
            <p className="adm-empty">このリンクの道中写真はまだありません</p>
          ) : (
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div key={p.id} className="photo-card">
                  <div className="photo-card-order">{i + 1}</div>
                  <img src={`${BASE}${p.url}`} alt={p.caption} />
                  {p.caption && <p className="photo-card-caption">{p.caption}</p>}
                  <div className="photo-card-actions">
                    <button className="photo-card-move" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button className="photo-card-move" onClick={() => move(i, 1)} disabled={i === photos.length - 1}>↓</button>
                    <button className="photo-card-composite" onClick={() => setEditingPhoto(p)}>合成</button>
                    <button className="photo-card-del" onClick={() => del(p)}>削除</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 到着地点の写真（このリンクに紐づく。「到着地点を確認する」で表示） */}
          <ArrivalPhotoManager linkId={selectedLink.id} initialPhotos={selectedLink.arrival_photos} />
        </div>
      )}

      {editingPhoto && (
        <CompositeEditor
          baseImageUrl={editingPhoto.url}
          title="道中写真に合成"
          onClose={() => setEditingPhoto(null)}
          onSave={async (blob) => {
            const form = new FormData();
            form.append("photo", blob, "composite.jpg");
            const updated = await api.photos.replace(editingPhoto.id, form);
            if (selectedLink) {
              onReordered(selectedLink.id, photos.map((ph) => (ph.id === updated.id ? updated : ph)));
            }
          }}
        />
      )}
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [offset, setOffset] = useState(0);
  const [rerouteVisibility, setRerouteVisibility] = useState(true);
  const [rerouteIncident, setRerouteIncident] = useState(true);
  const [reroteCongestion, setReroteCongestion] = useState(true);
  const [rerouteOther, setRerouteOther] = useState(true);
  const [stampUrl, setStampUrl] = useState("");
  const [surveyUrl, setSurveyUrl] = useState("");
  const [showCafeteriaCongestion, setShowCafeteriaCongestion] = useState(true);
  const [showArButton, setShowArButton] = useState(true);
  const [defaultDestId, setDefaultDestId] = useState<number | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [mapImages, setMapImages] = useState<MapImage[]>([]);
  const [mapFile, setMapFile] = useState<File | null>(null);
  const [mapName, setMapName] = useState("");
  const [uploading, setUploading] = useState(false);
  const mapFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.settings.get(),
      api.mapImages.list(),
      api.destinations.list(),
    ]).then(([s, imgs, dests]) => {
      setOffset(s.map_north_offset);
      setRerouteVisibility(s.reroute_visibility);
      setRerouteIncident(s.reroute_incident);
      setReroteCongestion(s.reroute_congestion);
      setRerouteOther(s.reroute_other);
      setStampUrl(s.stamp_url ?? "");
      setSurveyUrl(s.survey_url ?? "");
      setShowCafeteriaCongestion(s.show_cafeteria_congestion ?? true);
      setShowArButton(s.show_ar_button ?? true);
      setDefaultDestId(s.default_destination_id ?? null);
      setDestinations(dests);
      setMapImages(imgs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const saveSettings = async () => {
    try {
      await api.settings.update({
        map_north_offset: offset,
        reroute_visibility: rerouteVisibility,
        reroute_incident: rerouteIncident,
        reroute_congestion: reroteCongestion,
        reroute_other: rerouteOther,
        stamp_url: stampUrl.trim(),
        show_cafeteria_congestion: showCafeteriaCongestion,
        show_ar_button: showArButton,
        survey_url: surveyUrl.trim(),
        default_destination_id: defaultDestId,
      });
      setMsg({ type: "ok", text: "設定を保存しました" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  const uploadMap = async () => {
    if (!mapFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", mapFile);
      form.append("name", mapName || mapFile.name);
      const img = await api.mapImages.upload(form);
      setMapImages((prev) => [img, ...prev]);
      setMapFile(null);
      setMapName("");
      if (mapFileRef.current) mapFileRef.current.value = "";
      setMsg({ type: "ok", text: "マップ画像をアップロードしました" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setUploading(false);
    }
  };

  const activateMap = async (id: number) => {
    try {
      const updated = await api.mapImages.activate(id);
      setMapImages((prev) => prev.map((img) => ({ ...img, is_active: img.id === id })));
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  const deleteMap = async (id: number) => {
    if (!window.confirm("このマップ画像を削除しますか？")) return;
    try {
      await api.mapImages.delete(id);
      setMapImages((prev) => prev.filter((img) => img.id !== id));
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  if (loading) return <p className="adm-empty">読み込み中...</p>;

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>マップ画像</h3>
        {msg && (
          <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
            {msg.text} ✕
          </div>
        )}
        <div className="adm-field">
          <label>画像ファイル <span className="req">*</span></label>
          <input
            ref={mapFileRef}
            type="file"
            accept="image/*"
            onChange={(e) => setMapFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="adm-field">
          <label>名前</label>
          <input value={mapName} onChange={(e) => setMapName(e.target.value)} placeholder="例: 1Fフロアマップ" />
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={uploadMap} disabled={uploading || !mapFile}>
            {uploading ? "アップロード中..." : "アップロード"}
          </button>
        </div>

        <div className="adm-section-label" style={{ marginTop: 24 }}>ヘッダー設定</div>
        <div className="adm-field">
          <label>スタンプボタンのリンク先URL</label>
          <p className="hint">入力するとヘッダーに「スタンプ」ボタンが表示され、このURLを新しいタブで開きます。空にすると非表示。</p>
          <input
            type="url"
            value={stampUrl}
            onChange={(e) => setStampUrl(e.target.value)}
            placeholder="例: https://example.com/stamp"
          />
        </div>
        <div className="adm-section-label" style={{ marginTop: 24 }}>ヘッダー表示</div>
        <div className="adm-field">
          <label className="adm-checkbox-label">
            <input
              type="checkbox"
              checked={showCafeteriaCongestion}
              onChange={(e) => setShowCafeteriaCongestion(e.target.checked)}
            />
            食堂の混雑度をヘッダーに表示する
          </label>
          <p className="hint">個々の食堂の登録・混雑度は「食堂」タブで管理します。</p>
        </div>
        <div className="adm-field">
          <label className="adm-checkbox-label">
            <input
              type="checkbox"
              checked={showArButton}
              onChange={(e) => setShowArButton(e.target.checked)}
            />
            AR ボタンをヘッダーに表示する
          </label>
        </div>

        <div className="adm-section-label" style={{ marginTop: 24 }}>到着カード設定</div>
        <div className="adm-field">
          <label>アンケートのリンク先URL</label>
          <p className="hint">入力すると到着カードに「アンケートにご協力お願いします」ボタンが表示され、このURLを新しいタブで開きます。空にすると非表示。</p>
          <input
            type="url"
            value={surveyUrl}
            onChange={(e) => setSurveyUrl(e.target.value)}
            placeholder="例: https://forms.gle/xxxx"
          />
        </div>

        <div className="adm-section-label" style={{ marginTop: 24 }}>ホーム画面設定</div>
        <div className="adm-field">
          <label>デフォルトの目的地</label>
          <p className="hint">ホーム画面を開いたとき、最初からこの目的地が選択された状態になります（現在地が特定でき次第、そのまま道案内が始まります）。「選択なし」にすると未選択で開始します。</p>
          <select
            value={defaultDestId ?? ""}
            onChange={(e) => setDefaultDestId(Number(e.target.value) || null)}
          >
            <option value="">選択なし</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="adm-section-label" style={{ marginTop: 24 }}>コンパス設定</div>
        <div className="adm-field">
          <label>マップ北オフセット（度）</label>
          <p className="hint">地図の「上」方向が向いている方位。北が上なら 0、東が上なら 90。</p>
          <input
            type="number"
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
            min="-180" max="360" step="1"
          />
        </div>
        <div className="adm-section-label" style={{ marginTop: 24 }}>迂回ボタン表示設定</div>
        <p className="hint" style={{ marginBottom: 8 }}>オフにしたボタンはユーザーの道案内画面に表示されません。</p>
        {[
          { label: "写真識別不可で迂回する！", value: rerouteVisibility, set: setRerouteVisibility },
          { label: "事故・工事で迂回する！",   value: rerouteIncident,   set: setRerouteIncident },
          { label: "混雑過多で迂回する！",     value: reroteCongestion,  set: setReroteCongestion },
          { label: "その他で迂回する！",       value: rerouteOther,      set: setRerouteOther },
        ].map(({ label, value, set }) => (
          <div key={label} className="adm-field">
            <label className="adm-checkbox-label">
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
              {label}
            </label>
          </div>
        ))}

        <div className="adm-actions">
          <button className="btn-primary" onClick={saveSettings}>保存</button>
        </div>
      </div>

      <div className="adm-list-col">
        <h3>マップ画像一覧 <span className="count-badge">{mapImages.length}</span></h3>
        {mapImages.length === 0 ? (
          <p className="adm-empty">マップ画像がまだありません</p>
        ) : (
          <div className="map-image-list">
            {mapImages.map((img) => (
              <div key={img.id} className={`map-image-card${img.is_active ? " active" : ""}`}>
                <img src={`${BASE}${img.url}`} alt={img.name} className="map-image-thumb" />
                <div className="map-image-info">
                  <strong>{img.name}</strong>
                  {img.is_active && <span className="map-active-badge">使用中</span>}
                </div>
                <div className="map-image-actions">
                  {!img.is_active && (
                    <button className="btn-edit" onClick={() => activateMap(img.id)}>使用する</button>
                  )}
                  <button className="btn-del" onClick={() => deleteMap(img.id)}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function getWsBase(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl) return apiUrl.replace(/^https/, "wss").replace(/^http/, "ws");
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

const TEST_STEPS = [
  { step: 1, total: 3, from: "エントランス", to: "A棟廊下" },
  { step: 2, total: 3, from: "A棟廊下",    to: "エレベーター前" },
  { step: 3, total: 3, from: "エレベーター前", to: "目的地" },
];

const USER_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#a855f7","#ec4899"];

function UserMapView({ positions, nodes }: { positions: ReturnType<typeof useAdminWS>["positions"]; nodes: Node[] }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [mapImage, setMapImage] = useState<MapImage | null>(null);
  const [naturalW, setNaturalW] = useState(0);
  const [naturalH, setNaturalH] = useState(0);

  useEffect(() => {
    api.mapImages.getActive().then(setMapImage).catch(() => {});
  }, []);

  if (!mapImage) return <p className="users-empty">マップ画像が設定されていません</p>;

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="user-map-view">
      <div className="map-picker" style={{ cursor: "default" }}>
        <img
          ref={imgRef}
          src={`${BASE}${mapImage.url}`}
          alt={mapImage.name}
          draggable={false}
          onLoad={(e) => {
            setNaturalW(e.currentTarget.naturalWidth);
            setNaturalH(e.currentTarget.naturalHeight);
          }}
        />
        {naturalW > 0 && naturalH > 0 && positions.map((p, i) => {
          const node = nodes.find((n) => n.id === p.from_node_id);
          if (!node) return null;
          const color = USER_COLORS[i % USER_COLORS.length];
          return (
            <div
              key={p.user_id}
              className="user-map-dot"
              style={{ left: pct(node.x, naturalW), top: pct(node.y, naturalH), background: color }}
              title={`${p.user_id.slice(0, 8)}: ${p.from_node} → ${p.to_node}`}
            >
              <span className="user-map-dot-label">{i + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UsersTab({ nodes }: { nodes: Node[] }) {
  const { positions, connected } = useAdminWS();
  const [testStep, setTestStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const testWsRef = React.useRef<WebSocket | null>(null);
  const myId = getDeviceId();

  const copyId = () => {
    navigator.clipboard.writeText(myId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  };

  const sendTestPosition = () => {
    const s = TEST_STEPS[testStep % TEST_STEPS.length];
    const send = (ws: WebSocket) => {
      ws.send(JSON.stringify({
        type: "position",
        user_id: "test-user",
        step: s.step,
        total_steps: s.total,
        from_node: s.from,
        to_node: s.to,
      }));
      setTestStep((n) => n + 1);
    };

    const ws = testWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      send(ws);
    } else {
      const newWs = new WebSocket(`${getWsBase()}/ws/user`);
      testWsRef.current = newWs;
      newWs.onopen = () => send(newWs);
    }
  };

  const clearTest = () => {
    testWsRef.current?.close();
    testWsRef.current = null;
    setTestStep(0);
  };

  return (
    <div className="users-tab">
      <div className="my-device-id">
        <span className="my-device-id-label">自分のID</span>
        <span className="my-device-id-value">{myId}</span>
        <button className="btn-copy-id" onClick={copyId}>
          {copied ? "コピー済 ✓" : "コピー"}
        </button>
      </div>
      <div className="users-tab-status">
        <span className={`ws-dot ${connected ? "connected" : "disconnected"}`} />
        {connected ? "リアルタイム接続中" : "接続待機中..."}
        <span className="users-count">{positions.length} 人</span>
      </div>
      <div className="users-test-bar">
        <button className="btn-test-send" onClick={sendTestPosition}>
          テスト送信 ({TEST_STEPS[testStep % TEST_STEPS.length].step}/{TEST_STEPS[0].total})
        </button>
        <button className="btn-test-clear" onClick={clearTest}>クリア</button>
        <span className="test-hint">ボタンを押すたびにステップが進みます</span>
      </div>
      <UserMapView positions={positions} nodes={nodes} />
      {positions.length === 0 ? (
        <p className="users-empty">現在案内中のユーザーはいません</p>
      ) : (
        <div className="users-list">
          {positions.map((p: UserPosition) => (
            <div key={p.user_id} className="user-card">
              <div className="user-card-header">
                <span className="user-id">ID: {p.user_id}</span>
                <span className="user-updated">{fmt(p.updated_at)}</span>
              </div>
              <div className="user-step-info">
                <span className="user-step-badge">{p.step} / {p.total_steps}</span>
                <span className="user-route">{p.from_node} → {p.to_node}</span>
              </div>
              <div className="user-progress-bar">
                <div
                  className="user-progress-fill"
                  style={{ width: `${(p.step / p.total_steps) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detour Tab ────────────────────────────────────────────────────────────────

function DetourTab({ nodes }: { nodes: Node[] }) {
  const [detours, setDetours] = useState<NodeDetour[]>([]);
  const [nodeId, setNodeId] = useState<number | "">("");
  const [detourNodeId, setDetourNodeId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 既存ペアのインライン編集（説明・画像）
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.nodeDetours.list().then(setDetours).catch(() => {});
  }, []);

  const pairedNodeIds = new Set(detours.map((d) => d.node_id));
  const pairedDetourIds = new Set(detours.map((d) => d.detour_node_id));

  const save = async () => {
    if (nodeId === "" || detourNodeId === "") {
      setMsg({ type: "err", text: "両方のノードを選択してください" });
      return;
    }
    if (nodeId === detourNodeId) {
      setMsg({ type: "err", text: "同じノードはペアにできません" });
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("node_id", String(nodeId));
      form.append("detour_node_id", String(detourNodeId));
      form.append("description", description.trim());
      if (imageFile) form.append("image", imageFile, imageFile.name || "detour.jpg");
      const created = await api.nodeDetours.create(form);
      setDetours((prev) => [...prev, created]);
      setNodeId("");
      setDetourNodeId("");
      setDescription("");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMsg({ type: "ok", text: "寄り道ペアを追加しました" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (d: NodeDetour) => {
    setEditingId(d.id);
    setEditDesc(d.description ?? "");
    setEditImageFile(null);
    if (editFileInputRef.current) editFileInputRef.current.value = "";
  };

  const saveEdit = async (id: number) => {
    try {
      const form = new FormData();
      form.append("description", editDesc.trim());
      if (editImageFile) form.append("image", editImageFile, editImageFile.name || "detour.jpg");
      const updated = await api.nodeDetours.update(id, form);
      setDetours((prev) => prev.map((d) => (d.id === id ? updated : d)));
      setEditingId(null);
      setMsg({ type: "ok", text: "更新しました" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  const del = async (id: number) => {
    if (!window.confirm("このペアを削除しますか？")) return;
    try {
      await api.nodeDetours.delete(id);
      setDetours((prev) => prev.filter((d) => d.id !== id));
      if (editingId === id) setEditingId(null);
      setMsg({ type: "ok", text: "削除しました" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  const nodeName = (id: number) => nodes.find((n) => n.id === id)?.name ?? `#${id}`;

  const availableNodes = nodes.filter((n) => !pairedNodeIds.has(n.id));
  const availableDetours = nodes.filter((n) => !pairedDetourIds.has(n.id));

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>寄り道ペアを追加</h3>
        {msg && (
          <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
            {msg.text} ✕
          </div>
        )}
        <div className="adm-field-row">
          <div className="adm-field">
            <label>元ノード <span className="req">*</span></label>
            <select value={nodeId} onChange={(e) => setNodeId(Number(e.target.value) || "")}>
              <option value="">選択してください</option>
              {availableNodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <p className="hint">すでにペアが設定済みのノードは非表示</p>
          </div>
          <div className="adm-field arrow-field">⇄</div>
          <div className="adm-field">
            <label>寄り道先ノード <span className="req">*</span></label>
            <select value={detourNodeId} onChange={(e) => setDetourNodeId(Number(e.target.value) || "")}>
              <option value="">選択してください</option>
              {availableDetours.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <p className="hint">すでに寄り道先として使用中のノードは非表示</p>
          </div>
        </div>
        <div className="adm-field">
          <label>説明文（任意）</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="寄り道カードに表示する説明（未入力なら寄り道先ノードの説明を表示）"
          />
        </div>
        <div className="adm-field">
          <label>画像（任意）</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="adm-actions">
          <button
            className="btn-primary"
            onClick={save}
            disabled={saving || nodeId === "" || detourNodeId === ""}
          >
            {saving ? "保存中..." : "追加"}
          </button>
        </div>
      </div>

      <div className="adm-list-col">
        <h3>寄り道ペア一覧 <span className="count-badge">{detours.length}</span></h3>
        {detours.length === 0 ? (
          <p className="adm-empty">寄り道ペアがまだありません</p>
        ) : (
          <div className="ar-feature-list">
            {detours.map((d) => (
              <div key={d.id} className="ar-feature-card">
                {d.image_url && (
                  <img src={`${BASE}${d.image_url}`} alt="" className="ar-feature-thumb" />
                )}
                <div className="ar-feature-info">
                  <strong>
                    {d.node?.name ?? nodeName(d.node_id)} ⇄ {d.detour_node?.name ?? nodeName(d.detour_node_id)}
                  </strong>
                  {d.description && <span className="ar-feature-meta">{d.description}</span>}

                  {editingId === d.id && (
                    <div className="adm-inline-edit">
                      <textarea
                        rows={3}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="説明文"
                      />
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => setEditImageFile(e.target.files?.[0] ?? null)}
                      />
                      <p className="hint">画像未選択なら現在の画像を維持します。</p>
                      <div className="adm-actions">
                        <button className="btn-primary" onClick={() => saveEdit(d.id)}>保存</button>
                        <button className="btn-secondary" onClick={() => setEditingId(null)}>キャンセル</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="adm-row-actions">
                  {editingId === d.id ? null : (
                    <button className="btn-secondary" onClick={() => startEdit(d)}>編集</button>
                  )}
                  <button className="btn-del" onClick={() => del(d.id)}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category Tab ─────────────────────────────────────────────────────────────

function CategoryTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isOpenDefault, setIsOpenDefault] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.categories.list().then(setCategories).catch(() => {});
  }, []);

  const reset = () => { setName(""); setSortOrder("0"); setIsOpenDefault(true); setEditingId(null); };

  const save = async () => {
    if (!name.trim()) { setMsg({ type: "err", text: "名前は必須です" }); return; }
    try {
      const data = { name: name.trim(), sort_order: Number(sortOrder) || 0, is_open_default: isOpenDefault };
      if (editingId) {
        const updated = await api.categories.update(editingId, data);
        setCategories((p) => p.map((c) => c.id === editingId ? updated : c));
        setMsg({ type: "ok", text: "更新しました" });
      } else {
        const created = await api.categories.create(data);
        setCategories((p) => [...p, created].sort((a, b) => a.sort_order - b.sort_order));
        setMsg({ type: "ok", text: `「${created.name}」を追加しました` });
      }
      reset();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id); setName(c.name); setSortOrder(String(c.sort_order)); setIsOpenDefault(c.is_open_default);
    setMsg(null);
  };

  const del = async (id: number, name: string) => {
    if (!window.confirm(`「${name}」を削除しますか？\n紐づく目的地のカテゴリは未設定になります。`)) return;
    try {
      await api.categories.delete(id);
      setCategories((p) => p.filter((c) => c.id !== id));
      if (editingId === id) reset();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>{editingId ? "カテゴリを編集" : "カテゴリを追加"}</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
        <div className="adm-field">
          <label>名前 <span className="req">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 教室、トイレ、食堂" />
        </div>
        <div className="adm-field">
          <label>並び順（小さいほど上）</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} min="0" step="1" />
        </div>
        <div className="adm-field">
          <label className="adm-checkbox-label">
            <input type="checkbox" checked={isOpenDefault} onChange={(e) => setIsOpenDefault(e.target.checked)} />
            デフォルトで開いた状態にする
          </label>
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={save}>{editingId ? "更新" : "追加"}</button>
          {editingId && <button className="btn-secondary" onClick={reset}>キャンセル</button>}
        </div>
      </div>

      <div className="adm-list-col">
        <h3>カテゴリ一覧 <span className="count-badge">{categories.length}</span></h3>
        {categories.length === 0 ? (
          <p className="adm-empty">カテゴリがまだありません</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr><th>名前</th><th>並び順</th><th>初期状態</th><th></th></tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className={editingId === c.id ? "editing" : ""}>
                  <td><strong>{c.name}</strong></td>
                  <td className="num">{c.sort_order}</td>
                  <td className="center">{c.is_open_default ? "開く" : <span className="text-muted">閉じる</span>}</td>
                  <td className="adm-row-actions">
                    <button className="btn-edit" onClick={() => startEdit(c)}>編集</button>
                    <button className="btn-del" onClick={() => del(c.id, c.name)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Event Tab ────────────────────────────────────────────────────────────────

// 食堂の管理タブ。食堂を複数登録し、名前・混雑度・並び順を編集できる。
function CafeteriaTab() {
  const [cafeterias, setCafeterias] = useState<Cafeteria[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [congestion, setCongestion] = useState(0);
  const [sortOrder, setSortOrder] = useState("0");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { api.cafeterias.list().then(setCafeterias).catch(() => {}); }, []);

  const reset = () => { setEditingId(null); setName(""); setCongestion(0); setSortOrder("0"); };

  const save = async () => {
    if (!name.trim()) { setMsg({ type: "err", text: "名前は必須です" }); return; }
    try {
      const data = { name: name.trim(), congestion_level: congestion, sort_order: Number(sortOrder) || 0 };
      if (editingId) {
        const u = await api.cafeterias.update(editingId, data);
        setCafeterias((p) => p.map((c) => (c.id === editingId ? u : c)));
        setMsg({ type: "ok", text: "更新しました" });
      } else {
        const created = await api.cafeterias.create(data);
        setCafeterias((p) => [...p, created]);
        setMsg({ type: "ok", text: `「${created.name}」を追加しました` });
      }
      reset();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  const startEdit = (c: Cafeteria) => {
    setEditingId(c.id); setName(c.name); setCongestion(c.congestion_level); setSortOrder(String(c.sort_order)); setMsg(null);
  };

  const del = async (id: number, nm: string) => {
    if (!window.confirm(`「${nm}」を削除しますか？`)) return;
    try {
      await api.cafeterias.delete(id);
      setCafeterias((p) => p.filter((c) => c.id !== id));
      if (editingId === id) reset();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>{editingId ? "食堂を編集" : "食堂を追加"}</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
        <p className="hint" style={{ marginBottom: 12 }}>
          登録した食堂は、ユーザーアプリのヘッダーに名前＋混雑度で表示されます（「設定」タブの表示ONが必要）。混雑度は食堂編集用アカウント（/cafeteria）からも更新できます。
        </p>
        <div className="adm-field">
          <label>名前 <span className="req">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 学生食堂" />
        </div>
        <div className="adm-field">
          <label>混雑度</label>
          <select value={congestion} onChange={(e) => setCongestion(Number(e.target.value))}>
            {CAFETERIA_CONGESTION_LABELS.map((lab, i) => <option key={i} value={i}>{lab}</option>)}
          </select>
        </div>
        <div className="adm-field">
          <label>並び順（小さいほど先）</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="0" />
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={save}>{editingId ? "更新" : "追加"}</button>
          {editingId && <button className="btn-secondary" onClick={() => { reset(); setMsg(null); }}>キャンセル</button>}
        </div>
      </div>
      <div className="adm-list-col">
        <h3>食堂一覧 <span className="count-badge">{cafeterias.length}</span></h3>
        {cafeterias.length === 0 ? (
          <p className="adm-empty">食堂がまだありません</p>
        ) : (
          <table className="adm-table">
            <thead><tr><th>名前</th><th>混雑度</th><th>並び順</th><th></th></tr></thead>
            <tbody>
              {cafeterias.map((c) => (
                <tr key={c.id} className={editingId === c.id ? "editing" : ""}>
                  <td><strong>{c.name}</strong></td>
                  <td>
                    <span className="dest-congestion-badge" style={{ background: CAFETERIA_CONGESTION_COLORS[c.congestion_level] }}>
                      {CAFETERIA_CONGESTION_LABELS[c.congestion_level]}
                    </span>
                  </td>
                  <td className="num">{c.sort_order}</td>
                  <td className="adm-row-actions">
                    <button className="btn-edit" onClick={() => startEdit(c)}>編集</button>
                    <button className="btn-del" onClick={() => del(c.id, c.name)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// 合成素材（到着写真に重ねる「合成用写真」）の管理タブ。
// 屋内案内タブ: リンクのペアを指定し、その間を通るときに出す屋内カードの画像を登録する。
function IndoorTransitionTab({ links }: { links: Link[] }) {
  const [transitions, setTransitions] = useState<IndoorTransition[]>([]);
  const [kind, setKind] = useState<"indoor" | "outdoor">("indoor");
  const [linkAId, setLinkAId] = useState<number | "">("");
  const [linkBId, setLinkBId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<IndoorTransition | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.indoorTransitions.list().then(setTransitions).catch(() => {}); }, []);

  const linkLabel = (id: number) => {
    const l = links.find((x) => x.id === id);
    return l
      ? `${l.from_node?.name ?? l.from_node_id} → ${l.to_node?.name ?? l.to_node_id}${l.name ? ` (${l.name})` : ""}`
      : `#${id}`;
  };

  const add = async () => {
    if (linkAId === "" || linkBId === "") { setMsg({ type: "err", text: "リンクを2つ選択してください" }); return; }
    if (linkAId === linkBId) { setMsg({ type: "err", text: "同じリンクはペアにできません" }); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("link_a_id", String(linkAId));
      form.append("link_b_id", String(linkBId));
      form.append("kind", kind);
      if (file) form.append("image", file);
      const created = await api.indoorTransitions.create(form);
      setTransitions((p) => [...p, created]);
      setLinkAId(""); setLinkBId(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ type: "ok", text: "追加しました" });
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setUploading(false); }
  };

  const del = async (id: number) => {
    if (!window.confirm("この屋内案内ペアを削除しますか？")) return;
    try {
      await api.indoorTransitions.delete(id);
      setTransitions((p) => p.filter((t) => t.id !== id));
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  // 種別（屋内に入る ⇄ 屋外に出る）を切り替える。
  const toggleKind = async (t: IndoorTransition) => {
    try {
      const form = new FormData();
      form.append("kind", t.kind === "indoor" ? "outdoor" : "indoor");
      const updated = await api.indoorTransitions.update(t.id, form);
      setTransitions((p) => p.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  const kindLabel = (k: string) => (k === "outdoor" ? "屋外に出る" : "屋内に入る");

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>屋内案内を追加</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
        <p className="hint" style={{ marginBottom: 12 }}>
          2つのリンクを指定すると、道案内でその2リンクを連続して通過するとき（＝その間を通るとき）にカードが表示されます。
          種別スイッチで「屋内に入る」／「屋外に出る」を選べます。画像は任意（未指定なら内蔵イラスト）。順序は問いません。
        </p>
        <div className="adm-field">
          <label>種別</label>
          <div className="sv-view-switch">
            <button type="button" className={kind === "indoor" ? "active" : ""} onClick={() => setKind("indoor")}>屋内に入る</button>
            <button type="button" className={kind === "outdoor" ? "active" : ""} onClick={() => setKind("outdoor")}>屋外に出る</button>
          </div>
        </div>
        <div className="adm-field">
          <label>リンクA <span className="req">*</span></label>
          <select value={linkAId} onChange={(e) => setLinkAId(Number(e.target.value) || "")}>
            <option value="">選択してください</option>
            {links.map((l) => <option key={l.id} value={l.id}>{linkLabel(l.id)}</option>)}
          </select>
        </div>
        <div className="adm-field">
          <label>リンクB <span className="req">*</span></label>
          <select value={linkBId} onChange={(e) => setLinkBId(Number(e.target.value) || "")}>
            <option value="">選択してください</option>
            {links.map((l) => <option key={l.id} value={l.id}>{linkLabel(l.id)}</option>)}
          </select>
        </div>
        <div className="adm-field">
          <label>画像（任意）</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn-secondary" style={{ marginTop: 8 }} onClick={() => cameraRef.current?.click()}>カメラで撮影</button>
          {file && <p className="hint">選択中: {file.name}</p>}
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={add} disabled={uploading || linkAId === "" || linkBId === ""}>
            {uploading ? "追加中..." : "追加"}
          </button>
        </div>
      </div>

      <div className="adm-list-col">
        <h3>屋内案内一覧 <span className="count-badge">{transitions.length}</span></h3>
        {transitions.length === 0 ? (
          <p className="adm-empty">屋内案内がまだありません</p>
        ) : (
          <table className="adm-table">
            <thead><tr><th>種別</th><th>リンクA</th><th>リンクB</th><th>画像</th><th></th></tr></thead>
            <tbody>
              {transitions.map((t) => (
                <tr key={t.id}>
                  <td className="center">
                    <button
                      type="button"
                      className="btn-edit"
                      title="タップで屋内/屋外を切り替え"
                      onClick={() => toggleKind(t)}
                    >
                      {kindLabel(t.kind)}
                    </button>
                  </td>
                  <td>{linkLabel(t.link_a_id)}</td>
                  <td>{linkLabel(t.link_b_id)}</td>
                  <td className="center">
                    {t.image_url
                      ? <img src={`${BASE}${t.image_url}`} alt="" style={{ height: 40, borderRadius: 4 }} />
                      : <span className="text-muted">内蔵</span>}
                  </td>
                  <td className="adm-row-actions">
                    {t.image_url && <button className="btn-edit" onClick={() => setEditing(t)}>合成</button>}
                    <button className="btn-del" onClick={() => del(t.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && editing.image_url && (
        <CompositeEditor
          baseImageUrl={editing.image_url}
          title="屋内画像に合成"
          onClose={() => setEditing(null)}
          onSave={async (blob) => {
            const form = new FormData();
            form.append("image", blob, "composite.jpg");
            const updated = await api.indoorTransitions.update(editing.id, form);
            setTransitions((p) => p.map((t) => (t.id === updated.id ? updated : t)));
          }}
        />
      )}
    </div>
  );
}

function OverlayImageTab() {
  const [overlays, setOverlays] = useState<OverlayImage[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.overlayImages.list().then(setOverlays).catch(() => {}); }, []);

  const upload = async () => {
    if (!file) { setMsg({ type: "err", text: "画像を選択してください" }); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("name", name.trim());
      const created = await api.overlayImages.upload(form);
      setOverlays((p) => [created, ...p]);
      setName(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ type: "ok", text: "登録しました" });
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setUploading(false); }
  };

  const del = async (id: number) => {
    if (!window.confirm("この合成用写真を削除しますか？")) return;
    try {
      await api.overlayImages.delete(id);
      setOverlays((p) => p.filter((o) => o.id !== id));
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>合成用写真を追加</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
        <p className="hint" style={{ marginBottom: 12 }}>
          到着地点写真に重ねる素材（透過PNG推奨）を登録します。写真タブの各到着写真の「合成」ボタンから、ここで登録した素材を重ねて上書き保存できます。
        </p>
        <div className="adm-field">
          <label>名前</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 記念フレーム" />
        </div>
        <div className="adm-field">
          <label>画像ファイル <span className="req">*</span></label>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={upload} disabled={uploading || !file}>
            {uploading ? "アップロード中..." : "アップロード"}
          </button>
        </div>
      </div>
      <div className="adm-list-col">
        <h3>合成用写真一覧 <span className="count-badge">{overlays.length}</span></h3>
        {overlays.length === 0 ? (
          <p className="adm-empty">合成用写真がまだありません</p>
        ) : (
          <div className="overlay-lib-grid">
            {overlays.map((o) => (
              <div key={o.id} className="overlay-lib-item">
                <img src={`${BASE}${o.url}`} alt={o.name} />
                <div className="overlay-lib-name">{o.name || "（名称なし）"}</div>
                <button className="btn-del" onClick={() => del(o.id)}>削除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DestinationTab({
  nodes,
  categories: categoriesProp,
  destinations,
  onChange,
  onCategoryCreated,
}: {
  nodes: Node[];
  categories: Category[];
  destinations: Destination[];
  onChange: (destinations: Destination[]) => void;
  onCategoryCreated?: (cat: Category) => void;
}) {
  const [categories, setCategories] = useState<Category[]>(categoriesProp);
  useEffect(() => { setCategories(categoriesProp); }, [categoriesProp]);

  const [id, setId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [sortOrder, setSortOrder] = useState("0");
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [nodeFilter, setNodeFilter] = useState("");
  const [isBusStop, setIsBusStop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // カテゴリのインライン追加（ノードタブから目的地タブへ移設）
  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [addingCat, setAddingCat] = useState(false);

  const reset = () => {
    setId(null); setName(""); setCategoryId(""); setSortOrder("0");
    setSelectedNodeIds([]); setNodeFilter(""); setIsBusStop(false);
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      const cat = await api.categories.create({ name: newCatName.trim(), sort_order: 0, is_open_default: true });
      setCategories((p) => [...p, cat]);
      setCategoryId(cat.id);
      setNewCatName(""); setShowNewCat(false);
      onCategoryCreated?.(cat);
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setAddingCat(false); }
  };

  const toggleNode = (nid: number) =>
    setSelectedNodeIds((prev) => prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid]);

  const startEdit = (d: Destination) => {
    setId(d.id); setName(d.name);
    setCategoryId(d.category_id ?? "");
    setSortOrder(String(d.sort_order));
    setSelectedNodeIds((d.nodes ?? []).map((n) => n.id));
    setNodeFilter("");
    setIsBusStop(d.is_bus_stop ?? false);
    setMsg(null);
  };

  const save = async () => {
    if (!name.trim()) { setMsg({ type: "err", text: "名前は必須です" }); return; }
    if (selectedNodeIds.length === 0) { setMsg({ type: "err", text: "所属ノードを1つ以上選択してください" }); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        category_id: categoryId !== "" ? Number(categoryId) : null,
        sort_order: Number(sortOrder) || 0,
        is_bus_stop: isBusStop,
        node_ids: selectedNodeIds,
      };
      if (id) {
        const updated = await api.destinations.update(id, data);
        onChange(destinations.map((d) => d.id === id ? updated : d));
        setMsg({ type: "ok", text: `「${updated.name}」を更新しました` });
      } else {
        const created = await api.destinations.create(data);
        onChange([...destinations, created]);
        setMsg({ type: "ok", text: `「${created.name}」を追加しました` });
      }
      reset();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setSaving(false); }
  };

  const del = async (destId: number, nm: string) => {
    if (!window.confirm(`「${nm}」を削除しますか？`)) return;
    try {
      await api.destinations.delete(destId);
      onChange(destinations.filter((d) => d.id !== destId));
      if (id === destId) reset();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  const nodeName = (nid: number) => nodes.find((n) => n.id === nid)?.name ?? `#${nid}`;
  const filteredNodes = nodes.filter((n) => n.name.toLowerCase().includes(nodeFilter.toLowerCase()));

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>{id ? "目的地を編集" : "目的地を追加"}</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
        <p className="hint" style={{ marginBottom: 12 }}>
          目的地は「行き先」の単位です。1つの目的地に複数のノードを登録でき、道案内では現在地から最も近いノードへ案内します。
        </p>
        <div className="adm-field">
          <label>名前 <span className="req">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 入口" />
        </div>
        <div className="adm-field">
          <label>カテゴリ</label>
          <div className="adm-cat-row">
            <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value) || "")}>
              <option value="">未設定</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="btn-add-cat" onClick={() => setShowNewCat((v) => !v)}>＋</button>
          </div>
          {showNewCat && (
            <div className="adm-inline-cat-form">
              <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="カテゴリ名を入力"
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} autoFocus />
              <button type="button" onClick={addCategory} disabled={addingCat || !newCatName.trim()}>
                {addingCat ? "追加中..." : "追加"}
              </button>
              <button type="button" onClick={() => { setShowNewCat(false); setNewCatName(""); }}>キャンセル</button>
            </div>
          )}
        </div>
        <div className="adm-field">
          <label>並び順（小さいほど先）</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="0" />
        </div>
        <div className="adm-field">
          <label className="adm-checkbox-label">
            <input type="checkbox" checked={isBusStop} onChange={(e) => setIsBusStop(e.target.checked)} />
            バス停にする
          </label>
          <p className="hint">オンにすると、ホーム画面の「バス停選択」の地図に表示され、現在地として選べます。</p>
        </div>
        <div className="adm-field">
          <label>所属ノード <span className="req">*</span></label>
          <p className="hint">この目的地に含める地点（ノード）を選びます。複数選ぶと、現在地から最も近いノードが案内先になります。</p>
          <input value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} placeholder="ノード名で絞り込み" />
          <div className="adm-node-checklist">
            {nodes.length === 0 ? (
              <p className="adm-empty">先に「ノード」タブで地点を登録してください</p>
            ) : filteredNodes.length === 0 ? (
              <p className="adm-empty">該当するノードがありません</p>
            ) : (
              filteredNodes.map((n) => (
                <label key={n.id} className="adm-check-item">
                  <input type="checkbox" checked={selectedNodeIds.includes(n.id)} onChange={() => toggleNode(n.id)} />
                  <span>{n.name}</span>
                </label>
              ))
            )}
          </div>
          {selectedNodeIds.length > 0 && (
            <p className="hint">選択中: {selectedNodeIds.map(nodeName).join("、")}</p>
          )}
        </div>
        <div className="adm-actions" style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "保存中..." : id ? "更新" : "追加"}
          </button>
          {id && <button className="btn-secondary" onClick={() => { reset(); setMsg(null); }}>キャンセル</button>}
        </div>
      </div>

      <div className="adm-list-col">
        <h3>目的地一覧 <span className="count-badge">{destinations.length}</span></h3>
        {destinations.length === 0 ? (
          <p className="adm-empty">目的地がまだありません</p>
        ) : (
          <table className="adm-table">
            <thead><tr><th>名前</th><th>カテゴリ</th><th>所属ノード</th><th>バス停</th><th>並び順</th><th></th></tr></thead>
            <tbody>
              {destinations.map((d) => (
                <tr key={d.id} className={id === d.id ? "editing" : ""}>
                  <td><strong>{d.name}</strong></td>
                  <td>{d.category?.name ?? <span className="text-muted">—</span>}</td>
                  <td>{d.nodes && d.nodes.length > 0 ? d.nodes.map((n) => n.name).join("、") : <span className="text-muted">—</span>}</td>
                  <td className="center">{d.is_bus_stop ? "✓" : <span className="text-muted">—</span>}</td>
                  <td className="num">{d.sort_order}</td>
                  <td className="adm-row-actions">
                    <button className="btn-edit" onClick={() => startEdit(d)}>編集</button>
                    <button className="btn-del" onClick={() => del(d.id, d.name)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EventTab({ destinations }: { destinations: Destination[] }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [destinationId, setDestinationId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.events.list().then(setEvents).catch(() => {});
  }, []);

  const destName = (id: number) => destinations.find((d) => d.id === id)?.name ?? `#${id}`;

  const add = async () => {
    if (destinationId === "") { setMsg({ type: "err", text: "目的地を選択してください" }); return; }
    if (!name.trim()) { setMsg({ type: "err", text: "イベント名は必須です" }); return; }
    try {
      const created = await api.events.create({ destination_id: Number(destinationId), name: name.trim() });
      setEvents((p) => [...p, created]);
      setName("");
      setMsg({ type: "ok", text: `「${created.name}」を追加しました` });
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  const del = async (id: number, nm: string) => {
    if (!window.confirm(`「${nm}」を削除しますか？`)) return;
    try {
      await api.events.delete(id);
      setEvents((p) => p.filter((e) => e.id !== id));
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>イベントを追加</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
        <p className="hint" style={{ marginBottom: 12 }}>
          目的地で開催されるイベント名を登録すると、目的地選択画面のその目的地カードにオレンジ色で流れて表示されます。
        </p>
        <div className="adm-field">
          <label>目的地 <span className="req">*</span></label>
          <select value={destinationId} onChange={(e) => setDestinationId(Number(e.target.value) || "")}>
            <option value="">選択してください</option>
            {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="adm-field">
          <label>イベント名 <span className="req">*</span></label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="例: 模擬店、ダンス公演、研究発表"
          />
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={add}>追加</button>
        </div>
      </div>

      <div className="adm-list-col">
        <h3>登録済みイベント <span className="count-badge">{events.length}</span></h3>
        {events.length === 0 ? (
          <p className="adm-empty">イベントがまだありません</p>
        ) : (
          <table className="adm-table">
            <thead><tr><th>目的地</th><th>イベント名</th><th></th></tr></thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.destination_id != null ? destName(ev.destination_id) : <span className="text-muted">—</span>}</td>
                  <td><strong>{ev.name}</strong></td>
                  <td className="adm-row-actions">
                    <button className="btn-del" onClick={() => del(ev.id, ev.name)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  app_open:           "起動",
  nav_start:          "ナビ開始",
  step_change:        "移動",
  goal_reached:       "到達",
  ar_start:           "AR開始",
  arrival_view:       "到着地点確認",
  reroute_visibility: "迂回:視認性",
  reroute_incident:   "迂回:事件等",
  reroute_congestion: "迂回:混雑",
  reroute_other:      "迂回:その他",
  survey_submit:      "アンケート回答",
};
const ACTION_COLOR: Record<string, string> = {
  app_open:           "#3b82f6",
  nav_start:          "#22c55e",
  step_change:        "#6b7280",
  goal_reached:       "#f59e0b",
  ar_start:           "#14b8a6",
  arrival_view:       "#8b5cf6",
  reroute_visibility: "#f97316",
  reroute_incident:   "#ef4444",
  reroute_congestion: "#a855f7",
  reroute_other:      "#94a3b8",
  survey_submit:      "#0ea5e9",
};

function LogsTab() {
  const [logs, setLogs] = useState<UserLog[]>([]);
  const [loading, setLoading] = useState(true);
  // 絞り込み条件
  const [dateFrom, setDateFrom] = useState("");   // datetime-local（開始）
  const [dateTo, setDateTo] = useState("");        // datetime-local（終了）
  const [action, setAction] = useState("");        // 行動ラベル（空=すべて）
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null); // 指定ユーザー

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await api.logs.list());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fmt = (iso: string | number) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  };

  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setAction(""); setSelectedDevice(null);
  };

  // 日時レンジ＋行動ラベルで絞り込んだ集合（ユーザー一覧の母集団にもなる）
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
  const toMs = dateTo ? new Date(dateTo).getTime() : Infinity;
  const inRange = logs.filter((l) => {
    const t = new Date(l.created_at).getTime();
    if (t < fromMs || t > toMs) return false;
    if (action && l.action !== action) return false;
    return true;
  });

  // その時間帯（＋行動ラベル）で活動したユーザー一覧。件数と最終時刻つき、最新順。
  const userMap = new Map<string, { count: number; last: number }>();
  for (const l of inRange) {
    const t = new Date(l.created_at).getTime();
    const e = userMap.get(l.device_id);
    if (e) { e.count++; if (t > e.last) e.last = t; }
    else userMap.set(l.device_id, { count: 1, last: t });
  }
  const users = [...userMap.entries()]
    .map(([device, v]) => ({ device, ...v }))
    .sort((a, b) => b.last - a.last);

  // 右ペインに表示するログ（ユーザー指定があればそのユーザーのみ）
  const displayed = selectedDevice
    ? inRange.filter((l) => l.device_id === selectedDevice)
    : inRange;

  // 表示中（絞り込み後）のログを CSV でダウンロードする
  const exportCsv = () => {
    const header = ["日時", "アクション", "デバイスID", "出発地", "目的地", "区間出発", "区間到着", "ステップ", "総ステップ"];
    const rows = displayed.map((l) => [
      new Date(l.created_at).toLocaleString("ja-JP"),
      ACTION_LABEL[l.action] ?? l.action,
      l.device_id,
      l.origin_node,
      l.dest_node,
      l.from_node,
      l.to_node,
      l.step > 0 ? l.step : "",
      l.total_steps > 0 ? l.total_steps : "",
    ]);
    downloadCsv(`logs_${csvTimestamp()}.csv`, toCsv([header, ...rows]));
  };

  const hasFilter = dateFrom || dateTo || action || selectedDevice;

  return (
    <div className="logs-tab">
      <div className="logs-toolbar">
        <label className="logs-field">
          <span>開始日時</span>
          <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="logs-field">
          <span>終了日時</span>
          <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label className="logs-field">
          <span>行動ラベル</span>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">すべての行動</option>
            {Object.entries(ACTION_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <button className="btn-refresh" onClick={clearFilters} disabled={!hasFilter}>条件クリア</button>
        <button className="btn-refresh" onClick={load}>更新</button>
        <button className="btn-refresh" onClick={exportCsv} disabled={displayed.length === 0}>
          CSVエクスポート
        </button>
      </div>

      {loading ? (
        <p className="adm-empty">読み込み中...</p>
      ) : (
        <div className="logs-body">
          {/* 左: その時間帯のユーザー一覧 */}
          <div className="logs-users">
            <h4 className="logs-pane-title">
              ユーザー一覧 <span className="count-badge">{users.length}</span>
            </h4>
            <button
              className={`logs-user-item${selectedDevice === null ? " active" : ""}`}
              onClick={() => setSelectedDevice(null)}
            >
              <span className="logs-user-id">全ユーザー</span>
              <span className="logs-user-meta">{inRange.length}件</span>
            </button>
            {users.map((u) => (
              <button
                key={u.device}
                className={`logs-user-item${selectedDevice === u.device ? " active" : ""}`}
                onClick={() => setSelectedDevice(u.device)}
                title={u.device}
              >
                <span className="logs-user-id">{u.device.slice(0, 8)}…</span>
                <span className="logs-user-meta">{u.count}件 / {fmt(u.last)}</span>
              </button>
            ))}
            {users.length === 0 && <p className="adm-empty">該当ユーザーなし</p>}
          </div>

          {/* 右: 行動ログ */}
          <div className="logs-list-col">
            <h4 className="logs-pane-title">
              行動ログ <span className="count-badge">{displayed.length}</span>
              {selectedDevice && (
                <span className="adm-section-sub" title={selectedDevice}>
                  ユーザー {selectedDevice.slice(0, 8)}… のみ
                </span>
              )}
            </h4>
            {displayed.length === 0 ? (
              <p className="adm-empty">ログがありません</p>
            ) : (
              <div className="logs-list">
                {displayed.map((log) => (
                  <div key={log.id} className="log-entry">
                    <span
                      className="log-action-badge"
                      style={{ background: ACTION_COLOR[log.action] ?? "#6b7280" }}
                    >
                      {ACTION_LABEL[log.action] ?? log.action}
                    </span>
                    <span className="log-time">{fmt(log.created_at)}</span>
                    <span className="log-device" title={log.device_id}>{log.device_id.slice(0, 8)}…</span>
                    {(log.origin_node || log.dest_node) ? (
                      <span className="log-route">{log.origin_node || "?"} <strong>→</strong> {log.dest_node || "?"}</span>
                    ) : log.from_node ? (
                      <span className="log-route">{log.from_node} → {log.to_node}</span>
                    ) : null}
                    {log.from_node && (log.origin_node || log.dest_node) && (
                      <span className="log-segment">区間: {log.from_node} → {log.to_node}</span>
                    )}
                    {log.step > 0 && (
                      <span className="log-step">{log.step}/{log.total_steps}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Survey Tab ────────────────────────────────────────────────────────────────

function SurveyTab() {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [view, setView] = useState<"questions" | "responses">("questions");

  // 質問フォーム
  const [text, setText] = useState("");
  const [type, setType] = useState<"likert" | "text">("likert");
  const [required, setRequired] = useState(false);
  const [scaleMax, setScaleMax] = useState("5");
  const [minLabel, setMinLabel] = useState("");
  const [maxLabel, setMaxLabel] = useState("");
  const [pageNo, setPageNo] = useState("1");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.survey.listQuestions().then(setQuestions).catch(() => {});
  }, []);

  const loadResponses = () => {
    api.survey.listResponses().then(setResponses).catch(() => {});
  };

  // 回答一覧を CSV でダウンロードする。
  // 質問を列・回答者を行にした横持ち形式。likert は数値、記述はテキストを出力する。
  const exportResponsesCsv = () => {
    const qs = [...questions].sort(byOrder);
    const cols = qs.map((q) => ({ id: q.id, text: q.text }));
    // 回答に含まれるが質問一覧に無い（削除済みなど）質問も列として拾う
    const known = new Set(cols.map((c) => c.id));
    const seen = new Set<number>();
    responses.forEach((r) => r.answers.forEach((a) => {
      if (!known.has(a.question_id) && !seen.has(a.question_id)) {
        seen.add(a.question_id);
        cols.push({ id: a.question_id, text: a.question_text || `質問#${a.question_id}` });
      }
    }));

    const header = ["回答ID", "デバイスID", "回答日時", ...cols.map((c) => c.text)];
    const rows = responses.map((r) => {
      const byQ = new Map(r.answers.map((a) => [a.question_id, a]));
      return [
        r.id,
        r.device_id,
        new Date(r.created_at).toLocaleString("ja-JP"),
        ...cols.map((c) => {
          const a = byQ.get(c.id);
          if (!a) return "";
          return a.question_type === "likert" ? a.value : a.text;
        }),
      ];
    });
    downloadCsv(`survey_responses_${csvTimestamp()}.csv`, toCsv([header, ...rows]));
  };

  const reset = () => {
    setText(""); setType("likert"); setRequired(false); setScaleMax("5");
    setMinLabel(""); setMaxLabel(""); setPageNo("1"); setSortOrder("0"); setIsActive(true); setEditingId(null);
  };

  const save = async () => {
    if (!text.trim()) { setMsg({ type: "err", text: "質問文は必須です" }); return; }
    try {
      const data: Partial<SurveyQuestion> = {
        text: text.trim(),
        type,
        required,
        page: Math.max(1, Number(pageNo) || 1),
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
        scale_max: Number(scaleMax) || 5,
        min_label: minLabel.trim(),
        max_label: maxLabel.trim(),
      };
      if (editingId) {
        const updated = await api.survey.updateQuestion(editingId, data);
        setQuestions((p) => p.map((q) => q.id === editingId ? updated : q).sort(byOrder));
        setMsg({ type: "ok", text: "更新しました" });
      } else {
        const created = await api.survey.createQuestion(data);
        setQuestions((p) => [...p, created].sort(byOrder));
        setMsg({ type: "ok", text: "質問を追加しました" });
      }
      reset();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  const startEdit = (q: SurveyQuestion) => {
    setEditingId(q.id); setText(q.text); setType(q.type); setRequired(q.required);
    setScaleMax(String(q.scale_max)); setMinLabel(q.min_label); setMaxLabel(q.max_label);
    setPageNo(String(q.page)); setSortOrder(String(q.sort_order)); setIsActive(q.is_active); setMsg(null);
  };

  const del = async (id: number) => {
    if (!window.confirm("この質問を削除しますか？\n既存の回答データは残ります。")) return;
    try {
      await api.survey.deleteQuestion(id);
      setQuestions((p) => p.filter((q) => q.id !== id));
      if (editingId === id) reset();
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  const activeCount = questions.filter((q) => q.is_active).length;

  return (
    <div>
      <div className="sv-view-switch">
        <button className={view === "questions" ? "active" : ""} onClick={() => setView("questions")}>
          質問設定 <span className="count-badge">{questions.length}</span>
        </button>
        <button
          className={view === "responses" ? "active" : ""}
          onClick={() => { setView("responses"); loadResponses(); }}
        >
          回答一覧 <span className="count-badge">{responses.length}</span>
        </button>
      </div>

      {view === "questions" ? (
        <div className="adm-layout">
          <div className="adm-form-col">
            <h3>{editingId ? "質問を編集" : "質問を追加"}</h3>
            {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
            <div className="adm-field">
              <label>質問文 <span className="req">*</span></label>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="例: 道案内は分かりやすかったですか？" />
            </div>
            <div className="adm-field">
              <label>回答形式</label>
              <select value={type} onChange={(e) => setType(e.target.value as "likert" | "text")}>
                <option value="likert">リッカート尺度（段階評価）</option>
                <option value="text">自由記述</option>
              </select>
            </div>
            {type === "likert" && (
              <>
                <div className="adm-field">
                  <label>段階数</label>
                  <select value={scaleMax} onChange={(e) => setScaleMax(e.target.value)}>
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>{n} 段階</option>
                    ))}
                  </select>
                </div>
                <div className="adm-field">
                  <label>左端（1）のラベル</label>
                  <input value={minLabel} onChange={(e) => setMinLabel(e.target.value)} placeholder="例: 不満" />
                </div>
                <div className="adm-field">
                  <label>右端（{scaleMax}）のラベル</label>
                  <input value={maxLabel} onChange={(e) => setMaxLabel(e.target.value)} placeholder="例: 満足" />
                </div>
              </>
            )}
            <div className="adm-field">
              <label>ページ番号</label>
              <p className="hint">同じ番号の質問が1つのページにまとまって表示されます。番号の小さいページから順に表示。</p>
              <input type="number" value={pageNo} onChange={(e) => setPageNo(e.target.value)} min="1" step="1" />
            </div>
            <div className="adm-field">
              <label>ページ内の並び順（小さいほど上）</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} min="0" step="1" />
            </div>
            <div className="adm-field">
              <label className="adm-checkbox-label">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
                必須の質問にする
              </label>
            </div>
            <div className="adm-field">
              <label className="adm-checkbox-label">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                有効（利用者に表示する）
              </label>
            </div>
            <div className="adm-actions">
              <button className="btn-primary" onClick={save}>{editingId ? "更新" : "追加"}</button>
              {editingId && <button className="btn-secondary" onClick={reset}>キャンセル</button>}
            </div>
          </div>

          <div className="adm-list-col">
            <h3>質問一覧 <span className="count-badge">{questions.length}</span>
              <span className="adm-section-sub">表示中 {activeCount} 問</span>
            </h3>
            {questions.length === 0 ? (
              <p className="adm-empty">質問がまだありません。追加すると到着画面にアプリ内アンケートが表示されます。</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr><th>P</th><th>質問</th><th>形式</th><th>必須</th><th>状態</th><th></th></tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr key={q.id} className={editingId === q.id ? "editing" : ""}>
                      <td className="num">{q.page}</td>
                      <td>
                        <strong>{q.text}</strong>
                        {q.type === "likert" && (
                          <div className="text-muted" style={{ fontSize: 11 }}>
                            {q.scale_max}段階{q.min_label || q.max_label ? `（${q.min_label || "1"}〜${q.max_label || q.scale_max}）` : ""}
                          </div>
                        )}
                      </td>
                      <td className="center">{q.type === "likert" ? "段階" : "記述"}</td>
                      <td className="center">{q.required ? "必須" : <span className="text-muted">任意</span>}</td>
                      <td className="center">{q.is_active ? "表示" : <span className="text-muted">非表示</span>}</td>
                      <td className="adm-row-actions">
                        <button className="btn-edit" onClick={() => startEdit(q)}>編集</button>
                        <button className="btn-del" onClick={() => del(q.id)}>削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="adm-list-col">
          <h3>
            回答一覧 <span className="count-badge">{responses.length}</span>
            <button
              className="btn-refresh"
              style={{ marginLeft: 12 }}
              onClick={exportResponsesCsv}
              disabled={responses.length === 0}
            >
              CSVエクスポート
            </button>
          </h3>
          {responses.length === 0 ? (
            <p className="adm-empty">まだ回答がありません。</p>
          ) : (
            <div className="sv-response-list">
              {responses.map((r) => (
                <div key={r.id} className="sv-response-card">
                  <div className="sv-response-head">
                    <span className="sv-response-device" title={r.device_id}>利用者 {r.device_id.slice(0, 8)}</span>
                    <span className="sv-response-date">{new Date(r.created_at).toLocaleString("ja-JP")}</span>
                  </div>
                  <ul className="sv-response-answers">
                    {r.answers.map((a) => (
                      <li key={a.id}>
                        <span className="sv-response-q">{a.question_text}</span>
                        <span className="sv-response-a">
                          {a.question_type === "likert" ? `★ ${a.value}` : a.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const byOrder = (a: SurveyQuestion, b: SurveyQuestion) =>
  a.page - b.page || a.sort_order - b.sort_order || a.id - b.id;

// ── AR Feature Tab ────────────────────────────────────────────────────────────

function ARFeatureTab({ nodes }: { nodes: Node[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1つの物体を複数枚の画像から覚えさせられるよう、画像は複数選択できる
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [maxFeatures, setMaxFeatures] = useState(500);

  // モード（登録 / 認識テスト / 物体マスタ）
  const [mode, setMode] = useState<"register" | "recognize" | "objects">("register");

  const [features, setFeatures] = useState<ARFeature[]>([]);
  const [name, setName] = useState("");
  const [buildingNodeId, setBuildingNodeId] = useState<number | "">("");
  const [arObjectId, setArObjectId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 物体マスタ（建物以外の詳細情報）
  const [arObjects, setArObjects] = useState<ARObject[]>([]);
  const [objForm, setObjForm] = useState({ name: "", category: "", image_url: "", link_url: "", description: "" });
  const [objSaving, setObjSaving] = useState(false);

  useEffect(() => {
    api.arFeatures.list().then(setFeatures).catch(() => {});
    api.arObjects.list().then(setArObjects).catch(() => {});
  }, []);

  const submitObject = async () => {
    if (!objForm.name.trim()) {
      setMsg({ type: "err", text: "物体名を入力してください" });
      return;
    }
    setObjSaving(true);
    setMsg(null);
    try {
      const created = await api.arObjects.create({
        name: objForm.name.trim(),
        category: objForm.category.trim(),
        image_url: objForm.image_url.trim(),
        link_url: objForm.link_url.trim(),
        description: objForm.description.trim(),
      });
      setArObjects((p) => [created, ...p]);
      setObjForm({ name: "", category: "", image_url: "", link_url: "", description: "" });
      setMsg({ type: "ok", text: `物体「${created.name}」を登録しました` });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setObjSaving(false);
    }
  };

  const delObject = async (id: number) => {
    if (!window.confirm("この物体を削除しますか？（紐づく認識データの参照は外れます）")) return;
    try {
      await api.arObjects.delete(id);
      setArObjects((p) => p.filter((o) => o.id !== id));
      if (arObjectId === id) setArObjectId("");
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  // 画像を選択 → プレビュー用 URL を作成（特徴点抽出はサーバー側で行う）。複数選択可。
  const onPickFiles = (list: FileList | null) => {
    const arr = list ? Array.from(list) : [];
    setMsg(null);
    setPreviewUrls((prev) => { prev.forEach((u) => URL.revokeObjectURL(u)); return arr.map((f) => URL.createObjectURL(f)); });
    setFiles(arr);
  };

  // プレビュー URL はアンマウント時に解放してメモリリークを防ぐ
  useEffect(() => () => {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
  }, [previewUrls]);

  const enterRecognize = () => {
    setMode("recognize");
    setMsg(null);
  };

  const enterRegister = () => {
    setMode("register");
  };

  // 選択した複数画像をまとめてアップロードし、各画像からサーバー（gocv）で ORB 抽出して登録する
  const submit = async () => {
    if (files.length === 0) {
      setMsg({ type: "err", text: "画像を選択してください" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const form = new FormData();
      files.forEach((f, i) => form.append("image", f, f.name || `arfeature_${i}.jpg`));
      form.append("name", name.trim() || `特徴点 ${new Date().toLocaleString("ja-JP")}`);
      if (buildingNodeId !== "") form.append("node_id", String(buildingNodeId));
      if (arObjectId !== "") form.append("ar_object_id", String(arObjectId));
      form.append("max_features", String(maxFeatures));

      const res = await api.arFeatures.create(form);
      setFeatures((p) => [...res.created, ...p]);
      const totalKp = res.created.reduce((s, f) => s + f.keypoint_count, 0);
      setName("");
      setArObjectId("");
      onPickFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMsg({
        type: "ok",
        text: `${res.created.length}枚の画像から合計${totalKp}個の特徴点を登録しました`
          + (res.skipped > 0 ? `（${res.skipped}枚は特徴点が検出できずスキップ）` : ""),
      });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!window.confirm("この特徴点データを削除しますか？")) return;
    try {
      await api.arFeatures.delete(id);
      setFeatures((p) => p.filter((f) => f.id !== id));
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
  };

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <div className="ar-mode-toggle">
          <button className={mode === "register" ? "active" : ""} onClick={enterRegister}>登録</button>
          <button className={mode === "recognize" ? "active" : ""} onClick={enterRecognize}>認識テスト</button>
          <button className={mode === "objects" ? "active" : ""} onClick={() => { setMode("objects"); setMsg(null); }}>物体マスタ</button>
        </div>

        <h3>{mode === "register" ? "画像から特徴点を抽出" : mode === "recognize" ? "登録した対象を認識" : "物体マスタ（建物以外の詳細情報）"}</h3>
        {msg && (
          <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
            {msg.text} ✕
          </div>
        )}

        <p className="hint" style={{ marginBottom: 12 }}>
          {mode === "register"
            ? "建物・看板などの画像をアップロードすると、サーバーが ORB 特徴点（コーナー）を抽出して登録します。1つの物体を複数の角度・距離で撮った画像を一度に選ぶと、それぞれから特徴点を抽出して同じ物体に登録するため、見る向きが変わっても認識しやすくなります。"
            : mode === "recognize"
            ? "登録済みの対象とカメラ映像を特徴点マッチングし、認識した名前と簡易詳細を表示します。"
            : "建物に紐づかない物体（展示物・看板・設備など）の詳細情報を登録します。登録モードで認識データに紐づけると、認識時にこの詳細が表示されます。"}
        </p>

        {mode === "objects" ? (
          <>
            <div className="adm-field">
              <label>物体名</label>
              <input
                value={objForm.name}
                onChange={(e) => setObjForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例: 〇〇の彫刻"
              />
            </div>
            <div className="adm-field">
              <label>種別（任意）</label>
              <input
                value={objForm.category}
                onChange={(e) => setObjForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="例: 展示物 / 看板 / 設備"
              />
            </div>
            <div className="adm-field">
              <label>画像URL（任意）</label>
              <input
                value={objForm.image_url}
                onChange={(e) => setObjForm((f) => ({ ...f, image_url: e.target.value }))}
                placeholder="未入力なら認識画像で代替表示"
              />
            </div>
            <div className="adm-field">
              <label>リンクURL（任意）</label>
              <input
                value={objForm.link_url}
                onChange={(e) => setObjForm((f) => ({ ...f, link_url: e.target.value }))}
                placeholder="例: https://example.com/detail"
              />
              <p className="hint">認識詳細に「詳しく見る」リンクとして表示されます。</p>
            </div>
            <div className="adm-field">
              <label>詳細説明</label>
              <textarea
                rows={4}
                value={objForm.description}
                onChange={(e) => setObjForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="認識時に表示する説明文"
              />
            </div>
            <div className="adm-actions">
              <button className="btn-primary" onClick={submitObject} disabled={objSaving}>
                {objSaving ? "登録中..." : "物体を登録"}
              </button>
            </div>
          </>
        ) : mode === "register" ? (
          <>
            <div className="ar-camera-wrap">
              {previewUrls.length > 0 ? (
                <img src={previewUrls[0]} alt="プレビュー" className="ar-camera-video" style={{ objectFit: "contain" }} />
              ) : (
                <div className="ar-camera-placeholder">画像を選択してください（複数選択可）</div>
              )}
            </div>

            {previewUrls.length > 0 && (
              <div className="ar-thumb-row">
                {previewUrls.map((u, i) => (
                  <img key={i} src={u} alt={`選択画像 ${i + 1}`} className="ar-thumb" />
                ))}
                <span className="ar-thumb-count">{previewUrls.length}枚選択中</span>
              </div>
            )}

            <div className="adm-actions" style={{ marginTop: 12 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </div>

            <div className="adm-field" style={{ marginTop: 16 }}>
              <label>最大特徴点数</label>
              <input
                type="number"
                min="50" max="2000" step="50"
                value={maxFeatures}
                onChange={(e) => setMaxFeatures(Number(e.target.value) || 500)}
              />
            </div>
            <div className="adm-field">
              <label>名前</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 〇〇館の正面" />
            </div>
            <div className="adm-field">
              <label>建物ノード（認識時に表示する建物名）</label>
              <select value={buildingNodeId} onChange={(e) => setBuildingNodeId(Number(e.target.value) || "")}>
                <option value="">未設定</option>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            <div className="adm-field">
              <label>物体（建物以外の詳細情報）</label>
              <select value={arObjectId} onChange={(e) => setArObjectId(Number(e.target.value) || "")}>
                <option value="">未設定</option>
                {arObjects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <p className="hint">建物ではない物体を認識させる場合に選びます。「物体マスタ」タブで先に登録してください。</p>
            </div>

            <div className="adm-actions">
              <button className="btn-primary" onClick={submit} disabled={files.length === 0 || saving}>
                {saving ? "登録中..." : `アップロードして登録${files.length > 1 ? `（${files.length}枚）` : ""}`}
              </button>
            </div>
          </>
        ) : (
          <ARRecognizer />
        )}
      </div>

      <div className="adm-list-col">
        {mode === "objects" ? (
          <>
            <h3>登録済み物体 <span className="count-badge">{arObjects.length}</span></h3>
            {arObjects.length === 0 ? (
              <p className="adm-empty">まだ登録がありません</p>
            ) : (
              <div className="ar-feature-list">
                {arObjects.map((o) => (
                  <div key={o.id} className="ar-feature-card">
                    {o.image_url && <img src={`${BASE}${o.image_url}`} alt={o.name} className="ar-feature-thumb" />}
                    <div className="ar-feature-info">
                      <strong>{o.name}</strong>
                      {o.category && <span className="ar-feature-meta">{o.category}</span>}
                      {o.description && <span className="ar-feature-meta">{o.description}</span>}
                    </div>
                    <button className="btn-del" onClick={() => delObject(o.id)}>削除</button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h3>登録済み特徴点 <span className="count-badge">{features.length}</span></h3>
            {features.length === 0 ? (
              <p className="adm-empty">まだ登録がありません</p>
            ) : (
              <div className="ar-feature-list">
                {features.map((f) => (
                  <div key={f.id} className="ar-feature-card">
                    <img src={`${BASE}${f.image_url}`} alt={f.name} className="ar-feature-thumb" />
                    <div className="ar-feature-info">
                      <strong>{f.name}</strong>
                      <span className="ar-feature-meta">{f.keypoint_count} 点 ／ {f.width}×{f.height}</span>
                      {f.node && <span className="ar-feature-node">建物: {f.node.name}</span>}
                      {f.ar_object && <span className="ar-feature-node">物体: {f.ar_object.name}</span>}
                    </div>
                    <button className="btn-del" onClick={() => del(f.id)}>削除</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

export const AdminPage: React.FC<Props> = ({
  nodes, links,
  onNodeCreated, onNodeUpdated, onNodeDeleted,
  onLinkCreated, onLinkUpdated, onLinkDeleted,
  onPhotoUploaded, onPhotoDeleted, onPhotoReordered,
}) => {
  const [tab, setTab] = useState<Tab>("node");
  const [categories, setCategories] = useState<Category[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.categories.list().then(setCategories).catch(() => {});
    api.destinations.list().then(setDestinations).catch(() => {});
  }, []);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "node", label: "ノード", badge: nodes.length },
    { key: "destination", label: "目的地", badge: destinations.length },
    { key: "link", label: "リンク", badge: links.length },
    { key: "detour", label: "寄り道" },
    { key: "indoor", label: "屋内案内" },
    { key: "photo", label: "写真" },
    { key: "overlay", label: "合成素材" },
    { key: "composite", label: "画像合成" },
    { key: "settings", label: "設定" },
    { key: "category", label: "カテゴリ", badge: categories.length },
    { key: "cafeteria", label: "食堂" },
    { key: "event", label: "イベント" },
    { key: "users", label: "利用者" },
    { key: "logs", label: "ログ" },
    { key: "ar", label: "AR特徴点" },
    { key: "demo", label: "ARデモ" },
    { key: "announce", label: "お知らせ" },
    { key: "survey", label: "アンケート" },
  ];

  const selectTab = (t: Tab) => {
    setTab(t);
    setMenuOpen(false);
  };

  const currentLabel = tabs.find((t) => t.key === tab)?.label ?? "";

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-top">
          <h2>管理画面</h2>
          <button
            className="adm-hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="メニュー"
            aria-expanded={menuOpen}
          >
            <span className="adm-hamburger-label">{currentLabel}</span>
            <span className="adm-hamburger-icon">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
        <div className={`adm-tab-bar${menuOpen ? " open" : ""}`}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "active" : ""}
              onClick={() => selectTab(t.key)}
            >
              {t.label}
              {t.badge != null && <span className="count-badge">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-page-body">
        {tab === "node" && (
          <NodeTab
            nodes={nodes}
            onCreated={onNodeCreated}
            onUpdated={onNodeUpdated}
            onDeleted={onNodeDeleted}
          />
        )}
        {tab === "link" && (
          <LinkTab
            nodes={nodes}
            links={links}
            onCreated={onLinkCreated}
            onUpdated={onLinkUpdated}
            onDeleted={onLinkDeleted}
          />
        )}
        {tab === "detour" && <DetourTab nodes={nodes} />}
        {tab === "indoor" && <IndoorTransitionTab links={links} />}
        {tab === "photo" && (
          <PhotoTab
            links={links}
            onUploaded={onPhotoUploaded}
            onDeleted={onPhotoDeleted}
            onReordered={onPhotoReordered}
            onLinkUpdated={onLinkUpdated}
          />
        )}
        {tab === "destination" && (
          <DestinationTab
            nodes={nodes}
            categories={categories}
            destinations={destinations}
            onChange={setDestinations}
            onCategoryCreated={(cat) => setCategories((p) => [...p, cat])}
          />
        )}
        {tab === "overlay" && <OverlayImageTab />}
        {tab === "composite" && <CompositeTab links={links} />}
        {tab === "cafeteria" && <CafeteriaTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "category" && <CategoryTab />}
        {tab === "event" && <EventTab destinations={destinations} />}
        {tab === "users" && <UsersTab nodes={nodes} />}
        {tab === "logs" && <LogsTab />}
        {tab === "ar" && <ARFeatureTab nodes={nodes} />}
        {tab === "demo" && <ARDemoTab nodes={nodes} />}
        {tab === "announce" && <AnnouncementTab />}
        {tab === "survey" && <SurveyTab />}
      </div>
    </div>
  );
};
