import React, { useEffect, useRef, useState } from "react";
import { Link, MapImage, Node, NodeDetour, Photo, UserLog } from "../types";
import { api } from "../api/client";
import { useAdminWS, UserPosition } from "../hooks/useAdminWS";
import { getDeviceId } from "../hooks/useUser";

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

type Tab = "node" | "link" | "detour" | "photo" | "settings" | "users" | "logs";

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
  isSelectable: boolean;
  congestionLevel: number;
  waitTime: string;
}

const emptyNode = (): NodeFormState => ({
  id: null, name: "", description: "", x: "", y: "", lat: "", lng: "", isSelectable: true, congestionLevel: 0, waitTime: "0",
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
        is_selectable: form.isSelectable,
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
      isSelectable: n.is_selectable,
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

        <div className="adm-field" style={{ marginTop: 12 }}>
          <label className="adm-checkbox-label">
            <input
              type="checkbox"
              checked={form.isSelectable}
              onChange={(e) => setForm((f) => ({ ...f, isSelectable: e.target.checked }))}
            />
            目的地として表示する
          </label>
          <p className="hint">オフにすると目的地選択リストに表示されません（中継地点などに使用）</p>
        </div>

        <div className="adm-field-row">
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
        {nodes.length === 0 ? (
          <p className="adm-empty">ノードがまだありません</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>名前</th><th>説明</th>
                <th>X</th><th>Y</th>
                <th>緯度</th><th>経度</th>
                <th>目的地</th>
                <th>混雑度</th>
                <th>待ち時間</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.id} className={form.id === n.id ? "editing" : ""}>
                  <td><strong>{n.name}</strong></td>
                  <td className="text-muted">{n.description || "—"}</td>
                  <td className="num">{Math.round(n.x)}</td>
                  <td className="num">{Math.round(n.y)}</td>
                  <td className="num">{n.lat != null ? n.lat.toFixed(5) : <span className="text-muted">—</span>}</td>
                  <td className="num">{n.lng != null ? n.lng.toFixed(5) : <span className="text-muted">—</span>}</td>
                  <td className="center">{n.is_selectable ? "✓" : <span className="text-muted">—</span>}</td>
                  <td className="center"><CongestionBadge level={n.congestion_level} /></td>
                  <td className="num">{n.wait_time > 0 ? `${n.wait_time}分` : <span className="text-muted">—</span>}</td>
                  <td className="adm-row-actions">
                    <button className="btn-edit" onClick={() => startEdit(n)}>編集</button>
                    <button className="btn-del" onClick={() => del(n.id, n.name)}>削除</button>
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

function PhotoTab({
  links,
  onUploaded,
  onDeleted,
  onReordered,
}: {
  links: Link[];
  onUploaded: (linkId: number, photo: Photo) => void;
  onDeleted: (linkId: number, photoId: number) => void;
  onReordered: (linkId: number, photos: Photo[]) => void;
}) {
  const [selectedLinkId, setSelectedLinkId] = useState<number | "">("");
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedLink = links.find((l) => l.id === selectedLinkId);

  const upload = async () => {
    if (selectedLinkId === "" || files.length === 0) {
      setMsg({ type: "err", text: "リンクとファイルを選択してください" });
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const form = new FormData();
        form.append("photo", files[i]);
        form.append("link_id", String(selectedLinkId));
        form.append("caption", files.length === 1 ? caption : "");
        form.append("sort_order", String(i));
        const photo = await api.photos.upload(form);
        onUploaded(Number(selectedLinkId), photo);
      }
      setMsg({ type: "ok", text: `${files.length}枚アップロードしました` });
      setFiles([]);
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setUploading(false);
    }
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

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>写真をアップロード</h3>
        {msg && (
          <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
            {msg.text} ✕
          </div>
        )}
        <div className="adm-field">
          <label>リンクを選択 <span className="req">*</span></label>
          <select value={selectedLinkId} onChange={(e) => setSelectedLinkId(Number(e.target.value) || "")}>
            <option value="">選択してください</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>
                {l.from_node?.name ?? l.from_node_id} → {l.to_node?.name ?? l.to_node_id}
                {l.name ? ` (${l.name})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="adm-field">
          <label>写真ファイル <span className="req">*</span></label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <p className="hint">{files.length}枚選択中</p>
          )}
        </div>
        <div className="adm-field">
          <label>キャプション {files.length > 1 && <span className="text-muted">（1枚の場合のみ）</span>}</label>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="写真の説明"
            disabled={files.length > 1}
          />
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={upload} disabled={uploading || files.length === 0 || selectedLinkId === ""}>
            {uploading ? "アップロード中..." : "アップロード"}
          </button>
        </div>
      </div>

      <div className="adm-list-col">
        <h3>
          写真一覧
          {selectedLink && (
            <span className="count-badge">{photos.length}枚</span>
          )}
        </h3>
        {!selectedLink ? (
          <p className="adm-empty">左でリンクを選択すると写真が表示されます</p>
        ) : photos.length === 0 ? (
          <p className="adm-empty">写真がまだありません</p>
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
                  <button className="photo-card-del" onClick={() => del(p)}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [offset, setOffset] = useState(0);
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
    ]).then(([s, imgs]) => {
      setOffset(s.map_north_offset);
      setMapImages(imgs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const saveSettings = async () => {
    try {
      await api.settings.update(offset);
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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
      const created = await api.nodeDetours.create({
        node_id: Number(nodeId),
        detour_node_id: Number(detourNodeId),
      });
      setDetours((prev) => [...prev, created]);
      setNodeId("");
      setDetourNodeId("");
      setMsg({ type: "ok", text: "寄り道ペアを追加しました" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!window.confirm("このペアを削除しますか？")) return;
    try {
      await api.nodeDetours.delete(id);
      setDetours((prev) => prev.filter((d) => d.id !== id));
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
          <table className="adm-table">
            <thead>
              <tr>
                <th>元ノード</th>
                <th></th>
                <th>寄り道先ノード</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {detours.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.node?.name ?? nodeName(d.node_id)}</strong></td>
                  <td className="text-muted">⇄</td>
                  <td><strong>{d.detour_node?.name ?? nodeName(d.detour_node_id)}</strong></td>
                  <td className="adm-row-actions">
                    <button className="btn-del" onClick={() => del(d.id)}>削除</button>
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
  reroute_visibility: "迂回:視認性",
  reroute_incident:   "迂回:事件等",
  reroute_congestion: "迂回:混雑",
  reroute_other:      "迂回:その他",
};
const ACTION_COLOR: Record<string, string> = {
  app_open:           "#3b82f6",
  nav_start:          "#22c55e",
  step_change:        "#6b7280",
  goal_reached:       "#f59e0b",
  reroute_visibility: "#f97316",
  reroute_incident:   "#ef4444",
  reroute_congestion: "#a855f7",
  reroute_other:      "#94a3b8",
};

function LogsTab() {
  const [logs, setLogs] = useState<UserLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = async (deviceId?: string) => {
    setLoading(true);
    try {
      setLogs(await api.logs.list(deviceId || undefined));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  };

  const filtered = filter ? logs.filter((l) => l.device_id.includes(filter)) : logs;

  return (
    <div className="logs-tab">
      <div className="logs-toolbar">
        <input
          className="logs-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="デバイスIDで絞り込み"
        />
        <button className="btn-refresh" onClick={() => load(filter || undefined)}>更新</button>
        <span className="logs-count">{filtered.length}件</span>
      </div>
      {loading ? (
        <p className="adm-empty">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="adm-empty">ログがありません</p>
      ) : (
        <div className="logs-list">
          {filtered.map((log) => (
            <div key={log.id} className="log-entry">
              <span
                className="log-action-badge"
                style={{ background: ACTION_COLOR[log.action] ?? "#6b7280" }}
              >
                {ACTION_LABEL[log.action] ?? log.action}
              </span>
              <span className="log-time">{fmt(log.created_at)}</span>
              <span className="log-device" title={log.device_id}>{log.device_id.slice(0, 8)}…</span>
              {log.from_node && (
                <span className="log-route">{log.from_node} → {log.to_node}</span>
              )}
              {log.step > 0 && (
                <span className="log-step">{log.step}/{log.total_steps}</span>
              )}
            </div>
          ))}
        </div>
      )}
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

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h2>管理画面</h2>
        <div className="adm-tab-bar">
          <button className={tab === "node" ? "active" : ""} onClick={() => setTab("node")}>
            ノード <span className="count-badge">{nodes.length}</span>
          </button>
          <button className={tab === "link" ? "active" : ""} onClick={() => setTab("link")}>
            リンク <span className="count-badge">{links.length}</span>
          </button>
          <button className={tab === "detour" ? "active" : ""} onClick={() => setTab("detour")}>
            寄り道
          </button>
          <button className={tab === "photo" ? "active" : ""} onClick={() => setTab("photo")}>
            写真
          </button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            設定
          </button>
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            利用者
          </button>
          <button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}>
            ログ
          </button>
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
        {tab === "photo" && (
          <PhotoTab
            links={links}
            onUploaded={onPhotoUploaded}
            onDeleted={onPhotoDeleted}
            onReordered={onPhotoReordered}
          />
        )}
        {tab === "settings" && <SettingsTab />}
        {tab === "users" && <UsersTab nodes={nodes} />}
        {tab === "logs" && <LogsTab />}
      </div>
    </div>
  );
};
