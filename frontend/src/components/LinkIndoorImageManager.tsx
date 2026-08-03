import React, { useRef, useState } from "react";
import { Link } from "../types";
import { api } from "../api/client";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  /** 対象リンク（indoor_image_url を含む） */
  link: Link;
  /** アップロード／削除後の更新済み Link を親へ返す */
  onUpdated: (link: Link) => void;
}

/**
 * リンクの「屋内案内カードの画像」を1枚だけ登録・差し替え・削除する。
 * スマホのカメラ撮影（capture）と端末内の画像選択の両方に対応。
 * 未設定のときは道案内の屋内カードに内蔵SVGイラストが表示される。
 */
export const LinkIndoorImageManager: React.FC<Props> = ({ link, onUpdated }) => {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("image", file, file.name || "indoor.jpg");
      const updated = await api.links.uploadIndoorImage(link.id, form);
      onUpdated(updated);
      setMsg({ type: "ok", text: "画像を設定しました" });
    } catch {
      setMsg({ type: "err", text: "アップロードに失敗しました" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!window.confirm("屋内案内カードの画像を削除しますか？")) return;
    try {
      const updated = await api.links.deleteIndoorImage(link.id);
      onUpdated(updated);
      setMsg({ type: "ok", text: "画像を削除しました" });
    } catch {
      setMsg({ type: "err", text: "削除に失敗しました" });
    }
  };

  return (
    <div className="adm-field" style={{ marginTop: 12 }}>
      <div className="adm-section-label">
        屋内案内カードの画像
        <span className="adm-section-sub">未設定なら内蔵イラストを表示</span>
      </div>
      <p className="hint">「この区間で屋内に入る」がONのとき、道案内の屋内案内カードにこの画像が表示されます。</p>

      {msg && (
        <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
          {msg.text} ✕
        </div>
      )}

      {link.indoor_image_url && (
        <div className="node-photo-grid">
          <div className="node-photo-item">
            <img src={`${BASE}${link.indoor_image_url}`} alt="" />
            <button type="button" className="node-photo-del" aria-label="この画像を削除" onClick={remove}>
              ×
            </button>
          </div>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPick} />
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPick} />
      <div className="arrival-photo-btns">
        <button type="button" className="btn-primary" disabled={uploading} onClick={() => cameraRef.current?.click()}>
          {uploading ? "アップロード中..." : "カメラで撮影"}
        </button>
        <button type="button" className="btn-secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          写真を選ぶ
        </button>
      </div>
    </div>
  );
};
