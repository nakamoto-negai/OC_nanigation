import React, { useState } from "react";
import { Photo } from "../types";

interface Props {
  photos: Photo[];
}

const BASE = import.meta.env.VITE_API_URL ?? "";

export const PhotoSlider: React.FC<Props> = ({ photos }) => {
  const [idx, setIdx] = useState(0);

  if (!photos || photos.length === 0) {
    return <div className="photo-slider empty">写真なし</div>;
  }

  const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);
  const photo = sorted[idx];

  return (
    <div className="photo-slider">
      <div className="photo-wrapper">
        <img src={`${BASE}${photo.url}`} alt={photo.caption || ""} />
        {photo.caption && <p className="photo-caption">{photo.caption}</p>}
      </div>
      {sorted.length > 1 && (
        <div className="photo-controls">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
          >
            ◀
          </button>
          <span>
            {idx + 1} / {sorted.length}
          </span>
          <button
            onClick={() => setIdx((i) => Math.min(sorted.length - 1, i + 1))}
            disabled={idx === sorted.length - 1}
          >
            ▶
          </button>
        </div>
      )}
      <div className="photo-dots">
        {sorted.map((_, i) => (
          <span
            key={i}
            className={`dot ${i === idx ? "active" : ""}`}
            onClick={() => setIdx(i)}
          />
        ))}
      </div>
    </div>
  );
};
