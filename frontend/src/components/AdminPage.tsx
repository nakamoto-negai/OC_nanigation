import React, { useRef, useState } from "react";
import { Link, Node, Photo } from "../types";
import { api } from "../api/client";

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

type Tab = "node" | "link" | "photo";

const BASE = import.meta.env.VITE_API_URL ?? "";

// ── Node Form ────────────────────────────────────────────────────────────────

interface NodeFormState {
  id: number | null;
  name: string;
  description: string;
  x: string;
  y: string;
  lat: string;
  lng: string;
}

const emptyNode = (): NodeFormState => ({
  id: null, name: "", description: "", x: "", y: "", lat: "", lng: "",
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

        <div className="adm-section-label">マップ表示座標</div>
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
  bidirectional: boolean;
}

const emptyLink = (): LinkFormState => ({
  id: null, fromNodeId: "", toNodeId: "", name: "", description: "", distance: "1", bidirectional: true,
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
        bidirectional: form.bidirectional,
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
      bidirectional: l.bidirectional,
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
          <div className="adm-field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={form.bidirectional}
                onChange={(e) => setForm((f) => ({ ...f, bidirectional: e.target.checked }))}
              />
              双方向
            </label>
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
              <tr><th>From</th><th></th><th>To</th><th>名前</th><th>距離</th><th>双方向</th><th>写真</th><th></th></tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} className={form.id === l.id ? "editing" : ""}>
                  <td><strong>{nodeName(l.from_node_id)}</strong></td>
                  <td className="text-muted">→</td>
                  <td><strong>{nodeName(l.to_node_id)}</strong></td>
                  <td>{l.name || "—"}</td>
                  <td className="num">{l.distance}</td>
                  <td className="center">{l.bidirectional ? "✓" : ""}</td>
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
          <button className={tab === "photo" ? "active" : ""} onClick={() => setTab("photo")}>
            写真
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
        {tab === "photo" && (
          <PhotoTab
            links={links}
            onUploaded={onPhotoUploaded}
            onDeleted={onPhotoDeleted}
            onReordered={onPhotoReordered}
          />
        )}
      </div>
    </div>
  );
};
