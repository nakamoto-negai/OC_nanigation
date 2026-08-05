import React, { useRef, useState } from "react";
import { MapImage } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

export interface MapMarker {
  id: number;
  x: number;
  y: number;
  label: string;
}

interface Props {
  mapImage: MapImage | null;
  markers: MapMarker[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** マップ画像が無いときに出す文言 */
  emptyText?: string;
  /** true のときマーカーの地点名ラベルを表示しない（現在地選択などで使う） */
  hideLabels?: boolean;
}

/**
 * マップ画像の上に地点マーカーを重ね、タップで選択させる（現在地・目的地の地図選択に使う）。
 * 座標は画像のピクセル座標(x,y)を naturalWidth/Height に対する割合で配置する（MapPicker と同方式）。
 */
export const MapSelector: React.FC<Props> = ({ mapImage, markers, selectedId, onSelect, emptyText, hideLabels }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(mapImage?.width || 0);
  const [naturalH, setNaturalH] = useState(mapImage?.height || 0);

  if (!mapImage) {
    return <p className="dest-empty">{emptyText ?? "マップ画像が登録されていません"}</p>;
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="map-selector">
      <div className="map-selector-inner">
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
        {naturalW > 0 && naturalH > 0 && markers.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`map-marker${m.id === selectedId ? " selected" : ""}`}
            style={{ left: pct(m.x, naturalW), top: pct(m.y, naturalH) }}
            onClick={() => onSelect(m.id)}
          >
            <span className="map-marker-dot" />
            {!hideLabels && <span className="map-marker-label">{m.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
};
