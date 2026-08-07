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
 *
 * ピンのずれ対策: 「コンテナ幅・高さに対する％」で置くと、端末やブラウザで画像の height:auto の
 * 解決やアスペクト比一致がわずかにずれたときにピンが画像とずれてしまう。そこで、
 * 画像の実際の描画サイズ(clientWidth/clientHeight)を ResizeObserver で実測し、
 * ピンをピクセル位置 (x/naturalW * 描画幅, y/naturalH * 描画高) で配置する。
 * これはアスペクト比一致の前提に依存せず、端末非依存で確実に画像と一致する。
 */
export const MapSelector: React.FC<Props> = ({ mapImage, markers, selectedId, onSelect, emptyText, hideLabels, logPrefix }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  // 画像のピクセル座標系（ノード座標の基準）
  const [naturalW, setNaturalW] = useState(mapImage?.width || 0);
  const [naturalH, setNaturalH] = useState(mapImage?.height || 0);
  // 画像の実描画サイズ（レイアウト後の見た目の px）。ピンのピクセル配置に使う。
  const [renderW, setRenderW] = useState(0);
  const [renderH, setRenderH] = useState(0);

  const url = mapImage?.url;

  // 自然サイズを確実に取得する。キャッシュ済みで onLoad が発火しない端末に備え、
  // マウント時/URL変更時に complete を確認して naturalWidth/Height を読み直す。
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setNaturalW(img.naturalWidth);
      setNaturalH(img.naturalHeight);
    }
  }, [url]);

  // 実描画サイズを実測して追従する（画面回転・リサイズ・モーダル開閉・画像ロードで変化する）。
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => {
      setRenderW(img.clientWidth);
      setRenderH(img.clientHeight);
    };
    update();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(img);
    }
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [url]);

  if (!mapImage) {
    return <p className="dest-empty">{emptyText ?? "マップ画像が登録されていません"}</p>;
  }

  const ready = naturalW > 0 && naturalH > 0 && renderW > 0 && renderH > 0;

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalW(img.naturalWidth);
    setNaturalH(img.naturalHeight);
    setRenderW(img.clientWidth);
    setRenderH(img.clientHeight);
  };

  return (
    <div className="map-selector">
      <div className="map-selector-inner">
        <img
          ref={imgRef}
          src={`${BASE}${mapImage.url}`}
          alt={mapImage.name}
          draggable={false}
          onLoad={onImgLoad}
        />
        {ready && markers.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`map-marker${m.id === selectedId ? " selected" : ""}`}
            style={{ left: `${(m.x / naturalW) * renderW}px`, top: `${(m.y / naturalH) * renderH}px` }}
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
