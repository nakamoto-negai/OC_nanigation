import React, { useState } from "react";
import { MapImage, Node } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  mapImage: MapImage;
  node: Node;
  /** 「次へ」を押したときに呼ぶ。呼び出し側で state をクリアする。 */
  onDone: () => void;
}

/**
 * GPS で現在地が特定されたとき、地図上のどこが選ばれたかを示すポップアップ。
 * 検出ノードの位置にピン＋パルスのアニメーションを出し、「次へ」ボタンを押すまで表示し続ける。
 */
export const LocatedPopup: React.FC<Props> = ({ mapImage, node, onDone }) => {
  const [nw, setNw] = useState(mapImage.width || 0);
  const [nh, setNh] = useState(mapImage.height || 0);

  return (
    <div className="loc-pop-overlay">
      <div className="loc-pop">
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
        <button className="loc-pop-next" onClick={onDone}>次へ</button>
      </div>
    </div>
  );
};
