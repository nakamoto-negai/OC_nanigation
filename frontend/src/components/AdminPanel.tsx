import React, { useState } from "react";
import { Link, Node, Photo } from "../types";
import { api } from "../api/client";

interface Props {
  nodes: Node[];
  links: Link[];
  pendingNode: { x: number; y: number } | null;
  onNodeCreated: (node: Node) => void;
  onNodeDeleted: (id: number) => void;
  onLinkCreated: (link: Link) => void;
  onLinkDeleted: (id: number) => void;
  onPhotoUploaded: (linkId: number, photo: Photo) => void;
  onPhotoDeleted: (linkId: number, photoId: number) => void;
  clearPending: () => void;
}

export const AdminPanel: React.FC<Props> = ({
  nodes,
  links,
  pendingNode,
  onNodeCreated,
  onNodeDeleted,
  onLinkCreated,
  onLinkDeleted,
  onPhotoUploaded,
  onPhotoDeleted,
  clearPending,
}) => {
  const [nodeName, setNodeName] = useState("");
  const [nodeDesc, setNodeDesc] = useState("");
  const [linkFrom, setLinkFrom] = useState<number | "">("");
  const [linkTo, setLinkTo] = useState<number | "">("");
  const [linkName, setLinkName] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [linkDist, setLinkDist] = useState("1");
  const [photoLinkId, setPhotoLinkId] = useState<number | "">("");
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [tab, setTab] = useState<"node" | "link" | "photo">("node");
  const [error, setError] = useState("");

  const createNode = async () => {
    if (!nodeName || !pendingNode) { setError("名前とマップ上の位置を指定してください"); return; }
    try {
      const node = await api.nodes.create({ name: nodeName, description: nodeDesc, x: pendingNode.x, y: pendingNode.y });
      onNodeCreated(node);
      setNodeName(""); setNodeDesc(""); clearPending();
    } catch (e: any) { setError(e.message); }
  };

  const deleteNode = async (id: number) => {
    if (!window.confirm("削除しますか？")) return;
    await api.nodes.delete(id);
    onNodeDeleted(id);
  };

  const createLink = async () => {
    if (linkFrom === "" || linkTo === "") { setError("FromとToを選択してください"); return; }
    try {
      const link = await api.links.create({
        from_node_id: linkFrom as number,
        to_node_id: linkTo as number,
        name: linkName,
        description: linkDesc,
        distance: parseFloat(linkDist) || 1,
      });
      onLinkCreated(link);
      setLinkFrom(""); setLinkTo(""); setLinkName(""); setLinkDesc(""); setLinkDist("1");
    } catch (e: any) { setError(e.message); }
  };

  const deleteLink = async (id: number) => {
    if (!window.confirm("削除しますか？")) return;
    await api.links.delete(id);
    onLinkDeleted(id);
  };

  const uploadPhoto = async () => {
    if (!photoFile || photoLinkId === "") { setError("ファイルとリンクを選択してください"); return; }
    const form = new FormData();
    form.append("photo", photoFile);
    form.append("link_id", String(photoLinkId));
    form.append("caption", photoCaption);
    form.append("sort_order", "0");
    try {
      const photo = await api.photos.upload(form);
      onPhotoUploaded(photoLinkId as number, photo);
      setPhotoFile(null); setPhotoCaption("");
    } catch (e: any) { setError(e.message); }
  };

  const deletePhoto = async (linkId: number, photo: Photo) => {
    if (!window.confirm("削除しますか？")) return;
    await api.photos.delete(photo.id);
    onPhotoDeleted(linkId, photo.id);
  };

  return (
    <div className="admin-panel">
      <h2>管理パネル</h2>
      {error && <div className="error-msg" onClick={() => setError("")}>{error} ✕</div>}

      <div className="tab-bar">
        <button className={tab === "node" ? "active" : ""} onClick={() => setTab("node")}>ノード</button>
        <button className={tab === "link" ? "active" : ""} onClick={() => setTab("link")}>リンク</button>
        <button className={tab === "photo" ? "active" : ""} onClick={() => setTab("photo")}>写真</button>
      </div>

      {tab === "node" && (
        <div className="tab-content">
          <h3>新規ノード</h3>
          {pendingNode ? (
            <p className="hint">位置: ({Math.round(pendingNode.x)}, {Math.round(pendingNode.y)}) ✓</p>
          ) : (
            <p className="hint">マップ上をクリックして位置を指定</p>
          )}
          <input placeholder="名前" value={nodeName} onChange={(e) => setNodeName(e.target.value)} />
          <input placeholder="説明" value={nodeDesc} onChange={(e) => setNodeDesc(e.target.value)} />
          <button onClick={createNode} disabled={!pendingNode}>追加</button>

          <h3>ノード一覧</h3>
          <ul className="item-list">
            {nodes.map((n) => (
              <li key={n.id}>
                <span>{n.name}</span>
                <button className="del-btn" onClick={() => deleteNode(n.id)}>削除</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "link" && (
        <div className="tab-content">
          <h3>新規リンク</h3>
          <select value={linkFrom} onChange={(e) => setLinkFrom(Number(e.target.value))}>
            <option value="">From ノード</option>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <select value={linkTo} onChange={(e) => setLinkTo(Number(e.target.value))}>
            <option value="">To ノード</option>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <input placeholder="リンク名" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          <input placeholder="説明" value={linkDesc} onChange={(e) => setLinkDesc(e.target.value)} />
          <input type="number" placeholder="距離" value={linkDist} onChange={(e) => setLinkDist(e.target.value)} min="0.1" step="0.1" />
          <button onClick={createLink}>追加</button>

          <h3>リンク一覧</h3>
          <ul className="item-list">
            {links.map((l) => (
              <li key={l.id}>
                <span>{l.from_node?.name ?? l.from_node_id} → {l.to_node?.name ?? l.to_node_id} {l.name && `(${l.name})`}</span>
                <button className="del-btn" onClick={() => deleteLink(l.id)}>削除</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "photo" && (
        <div className="tab-content">
          <h3>写真アップロード</h3>
          <select value={photoLinkId} onChange={(e) => setPhotoLinkId(Number(e.target.value))}>
            <option value="">リンクを選択</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>
                {l.from_node?.name ?? l.from_node_id} → {l.to_node?.name ?? l.to_node_id} {l.name && `(${l.name})`}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
          <input placeholder="キャプション" value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} />
          <button onClick={uploadPhoto}>アップロード</button>

          <h3>写真一覧 (リンク別)</h3>
          {links.filter((l) => l.photos && l.photos.length > 0).map((l) => (
            <div key={l.id} className="photo-group">
              <strong>{l.from_node?.name ?? l.from_node_id} → {l.to_node?.name ?? l.to_node_id}</strong>
              <div className="photo-thumb-list">
                {[...l.photos].sort((a, b) => a.sort_order - b.sort_order).map((p) => (
                  <div key={p.id} className="photo-thumb">
                    <img src={`${import.meta.env.VITE_API_URL ?? ""}${p.url}`} alt={p.caption} />
                    <button className="del-btn small" onClick={() => deletePhoto(l.id, p)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
