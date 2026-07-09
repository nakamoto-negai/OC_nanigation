import React, { useEffect, useState } from "react";
import { NodePhoto } from "../types";
import { api } from "../api/client";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  /** 到着地点（ゴール）のノードID */
  nodeId: number;
  /** サーバーから取得済みの初期写真（あれば）。無ければマウント時に取得する。 */
  initialPhotos?: NodePhoto[];
  /** 写真が1枚も無いときに表示する文言。未指定なら何も表示しない（null を返す）。 */
  emptyText?: string;
}

/**
 * 道案内の最後（ゴール）カードで、その地点(ノード)に登録された写真を「閲覧専用」で表示する。
 * 写真の登録・削除は管理画面（管理者）のみが行う。
 * 写真が無い場合、emptyText があればその文言を、無ければ何も表示しない。
 */
export const GoalPhotoGallery: React.FC<Props> = ({ nodeId, initialPhotos, emptyText }) => {
  const [photos, setPhotos] = useState<NodePhoto[]>(initialPhotos ?? []);

  // 初期写真が渡されていなければサーバーから取得する
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) return;
    let cancelled = false;
    api.nodePhotos
      .list(nodeId)
      .then((ps) => { if (!cancelled) setPhotos(ps); })
      .catch(() => { /* 取得失敗時は表示しない */ });
    return () => { cancelled = true; };
  }, [nodeId, initialPhotos]);

  if (photos.length === 0) {
    if (!emptyText) return null;
    return (
      <div className="goal-photos">
        <p className="goal-photos-title">到着地点の写真</p>
        <p className="goal-photos-empty">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="goal-photos">
      <p className="goal-photos-title">到着地点の写真</p>
      <div className="goal-photos-grid">
        {photos.map((p) => (
          <div key={p.id} className="goal-photo-item">
            <img src={`${BASE}${p.url}`} alt={p.caption || ""} />
          </div>
        ))}
      </div>
    </div>
  );
};
