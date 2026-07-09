import React, { useEffect, useRef, useState } from "react";
import { NodePhoto } from "../types";
import { api } from "../api/client";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  /** 対象ノードID */
  nodeId: number;
  /** 親が持っている写真（あれば初期表示に使う） */
  initialPhotos?: NodePhoto[];
  /** 写真一覧が変わったとき親のノード状態を同期するためのコールバック */
  onChange?: (photos: NodePhoto[]) => void;
}

/**
 * 管理画面のノード編集で、その地点(ノード)の写真を登録・削除する。
 * ここで登録した写真は、ユーザーの道案内ゴールカードに閲覧専用で表示される。
 */
export const NodePhotoManager: React.FC<Props> = ({ nodeId, initialPhotos, onChange }) => {
  const [photos, setPhotos] = useState<NodePhoto[]>(initialPhotos ?? []);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 編集対象ノードが切り替わったら、そのノードの写真を読み直す
  useEffect(() => {
    let cancelled = false;
    setPhotos(initialPhotos ?? []);
    api.nodePhotos
      .list(nodeId)
      .then((ps) => { if (!cancelled) { setPhotos(ps); onChange?.(ps); } })
      .catch(() => { /* 取得失敗時は初期値のまま */ });
    return () => { cancelled = true; };
    // nodeId が変わったときだけ読み直す（initialPhotos は初回のみ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const apply = (next: NodePhoto[]) => {
    setPhotos(next);
    onChange?.(next);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setMsg(null);
    try {
      const added: NodePhoto[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("photo", file, file.name || "node.jpg");
        form.append("node_id", String(nodeId));
        added.push(await api.nodePhotos.upload(form));
      }
      apply([...added, ...photos]);
      setMsg({ type: "ok", text: `${added.length}枚アップロードしました` });
    } catch {
      setMsg({ type: "err", text: "アップロードに失敗しました" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const del = async (id: number) => {
    if (!window.confirm("この写真を削除しますか？")) return;
    try {
      await api.nodePhotos.delete(id);
      apply(photos.filter((p) => p.id !== id));
    } catch {
      setMsg({ type: "err", text: "削除に失敗しました" });
    }
  };

  return (
    <div className="adm-field" style={{ marginTop: 12 }}>
      <div className="adm-section-label">
        到着地点の写真
        <span className="adm-section-sub">道案内のゴールカードに表示されます</span>
      </div>

      {msg && (
        <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
          {msg.text} ✕
        </div>
      )}

      {photos.length > 0 && (
        <div className="node-photo-grid">
          {photos.map((p) => (
            <div key={p.id} className="node-photo-item">
              <img src={`${BASE}${p.url}`} alt={p.caption || ""} />
              <button
                type="button"
                className="node-photo-del"
                aria-label="この写真を削除"
                onClick={() => del(p.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={onPick}
      />
      <button
        type="button"
        className="btn-secondary"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? "アップロード中..." : "写真を追加"}
      </button>
    </div>
  );
};
