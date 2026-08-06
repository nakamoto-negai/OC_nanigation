import React, { useEffect, useState } from "react";
import { MapImage, Node } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  mapImage: MapImage;
  node: Node;
  /** 表示が終わったとき（自動 or タップ）に呼ぶ。呼び出し側で state をクリアする。 */
  onDone: () => void;
  /** 表示時間(ms)。既定は短め（すぐ消える）。 */
  duration?: number;
}

/**
 * GPS で現在地が特定されたとき、地図上のどこが選ばれたかを一瞬だけ示すポップアップ。
 * 検出ノードの位置にピン＋パルスのアニメーションを出し、duration 後に自動で閉じる。
 */
export const LocatedPopup: React.FC<Props> = ({ mapImage, node, onDone, duration = 1800 }) => {
  const [nw, setNw] = useState(mapImage.width || 0);
  const [nh, setNh] = useState(mapImage.height || 0);

  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  return (
    <div className="loc-pop-overlay" onClick={onDone}>
      <div className="loc-pop" onClick={(e) => e.stopPropagation()}>
        <div className="loc-pop-title">現在地を特定しました</div>
        <div className="loc-pop-map">
          <img
            src={`${BASE}${mapImage.url}`}
            alt=""
            draggable={false}
            onLoad={(e) => { setNw(e.currentTarget.naturalWidth); setNh(e.currentTarget.naturalHeight); }}
          />
          {nw > 0 && nh > 0 && (
            <div className="loc-pop-pin" style={{ left: `${(node.x / nw) * 100}%`, top: `${(node.y / nh) * 100}%` }}>
              <span className="loc-pop-pulse" />
              <span className="loc-pop-dot" />
            </div>
          )}
        </div>
        <div className="loc-pop-name">{node.name}</div>
      </div>
    </div>
  );
};
