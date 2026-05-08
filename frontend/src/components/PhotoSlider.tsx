import React from "react";
import { Photo } from "../types";

interface Props {
  photos: Photo[];
}

const BASE = import.meta.env.VITE_API_URL ?? "";

export const PhotoSlider: React.FC<Props> = ({ photos }) => {
  if (!photos || photos.length === 0) {
    return <div className="photo-slider empty">写真なし</div>;
  }

  const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="photo-list">
      {sorted.map((p, i) => (
        <div key={p.id} className="photo-list-item">
          <img src={`${BASE}${p.url}`} alt={p.caption || ""} />
          {p.caption && <p className="photo-list-caption">{p.caption}</p>}
        </div>
      ))}
    </div>
  );
};
