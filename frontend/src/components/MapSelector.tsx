import React, { useEffect, useRef, useState } from "react";
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
  /** ボタン押下ログ用の接頭辞（例:「目的地地図選択」）。マーカーに `data-log` として付ける。 */
  logPrefix?: string;
}

/**
 * マップ画像の上に地点マーカーを重ね、タップで選択させる（現在地・目的地の地図選択に使う）。
 * 座標は画像のピクセル座標(x,y)を naturalWidth/Height に対する割合で配置する（MapPicker と同方式）。
 */
export const MapSelector: React.FC<Props> = ({ mapImage, markers, selectedId, onSelect, emptyText, hideLabels, logPrefix }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(mapImage?.width || 0);
  const [naturalH, setNaturalH] = useState(mapImage?.height || 0);

  // キャッシュ済み画像は onLoad が発火しないことがあり、その場合 DB 由来の初期値
  // （実サイズと食い違うことがある）のままになりピンがずれる。マウント時／URL変更時に
  // complete を確認して、実際の naturalWidth/Height を読み直す。
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setNaturalW(img.naturalWidth);
      setNaturalH(img.naturalHeight);
    }
  }, [mapImage?.url]);

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
            data-log={`${logPrefix ?? "地図選択"}: ${m.label}`}
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
