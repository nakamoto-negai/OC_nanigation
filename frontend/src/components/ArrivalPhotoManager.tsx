import React, { useEffect, useRef, useState } from "react";
import { ArrivalPhoto } from "../types";
import { api } from "../api/client";
import { ArrivalCompositeEditor } from "./ArrivalCompositeEditor";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  /** 対象リンクID */
  linkId: number;
  /** 親が持っている写真（あれば初期表示に使う） */
  initialPhotos?: ArrivalPhoto[];
  /** 写真一覧が変わったとき親のリンク状態を同期するためのコールバック */
  onChange?: (photos: ArrivalPhoto[]) => void;
}

/**
 * 管理画面のリンク（写真タブ）で、そのリンクの「到着地点の写真」を登録・削除する。
 * ここで登録した写真は、道案内の「到着地点を確認する」でユーザーに閲覧専用で表示される。
 * リンクの道中スライダー写真（Photo）とは別系統。
 */
export const ArrivalPhotoManager: React.FC<Props> = ({ linkId, initialPhotos, onChange }) => {
  const [photos, setPhotos] = useState<ArrivalPhoto[]>(initialPhotos ?? []);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // 合成エディタで編集中の写真（null なら閉じている）
  const [editing, setEditing] = useState<ArrivalPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // スマホのカメラ直接起動用（capture 付き）。PC では通常のファイル選択にフォールバックする。
  const cameraRef = useRef<HTMLInputElement>(null);

  // 対象リンクが切り替わったら、そのリンクの写真を読み直す
  useEffect(() => {
    let cancelled = false;
    setPhotos(initialPhotos ?? []);
    api.arrivalPhotos
      .list(linkId)
      .then((ps) => { if (!cancelled) { setPhotos(ps); onChange?.(ps); } })
      .catch(() => { /* 取得失敗時は初期値のまま */ });
    return () => { cancelled = true; };
    // linkId が変わったときだけ読み直す（initialPhotos は初回のみ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  const apply = (next: ArrivalPhoto[]) => {
    setPhotos(next);
    onChange?.(next);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setMsg(null);
    try {
      const added: ArrivalPhoto[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("photo", file, file.name || "arrival.jpg");
        form.append("link_id", String(linkId));
        added.push(await api.arrivalPhotos.upload(form));
      }
      apply([...photos, ...added]);
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
      await api.arrivalPhotos.delete(id);
      apply(photos.filter((p) => p.id !== id));
    } catch {
      setMsg({ type: "err", text: "削除に失敗しました" });
    }
  };

  return (
    <div className="adm-field" style={{ marginTop: 20 }}>
      <div className="adm-section-label">
        到着地点の写真
        <span className="adm-section-sub">「到着地点を確認する」で表示されます</span>
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
              <button
                type="button"
                className="node-photo-composite"
                onClick={() => setEditing(p)}
              >
                合成
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ArrivalCompositeEditor
          photo={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => apply(photos.map((p) => (p.id === updated.id ? updated : p)))}
        />
      )}

      {/* カメラ撮影用（スマホは背面カメラが起動、PCはファイル選択にフォールバック） */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onPick}
      />
      {/* 端末内の画像から選ぶ用（複数可） */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={onPick}
      />
      <div className="arrival-photo-btns">
        <button
          type="button"
          className="btn-primary"
          disabled={uploading}
          onClick={() => cameraRef.current?.click()}
        >
          {uploading ? "アップロード中..." : "カメラで撮影"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          写真を選ぶ
        </button>
      </div>
    </div>
  );
};
