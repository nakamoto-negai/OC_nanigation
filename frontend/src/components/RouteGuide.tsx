import React from "react";
import { RouteResponse, RouteStepDetail } from "../types";
import { PhotoSlider } from "./PhotoSlider";

interface Props {
  route: RouteResponse;
  onClose: () => void;
}

export const RouteGuide: React.FC<Props> = ({ route, onClose }) => {
  const last = route.node_path[route.node_path.length - 1];

  return (
    <div className="route-guide fullscreen">
      <div className="route-guide-header">
        <div className="route-summary">
          <span className="route-title">道案内</span>
          <span className="route-distance">総距離: {route.total_distance.toFixed(1)}</span>
          <div className="route-path">
            {route.node_path.map((n, i) => (
              <React.Fragment key={n.id}>
                <span className={`path-node ${i === 0 ? "start" : i === route.node_path.length - 1 ? "goal" : ""}`}>
                  {n.name}
                </span>
                {i < route.node_path.length - 1 && <span className="path-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>✕ 閉じる</button>
      </div>

      <div className="route-guide-scroll">
        {route.steps.map((s: RouteStepDetail, i) => (
          <div key={i} className="rg-step">
            <div className="rg-step-header">
              <div className="rg-step-number">{s.step_number}</div>
              <div className="rg-step-title">
                <span className="rg-from">{s.from_node.name}</span>
                <span className="rg-arrow">→</span>
                <span className="rg-to">{s.to_node.name}</span>
              </div>
            </div>
            {s.link.name && <p className="rg-link-name">{s.link.name}</p>}
            {s.link.description && <p className="rg-description">{s.link.description}</p>}
            <p className="rg-distance">距離: {s.link.distance.toFixed(1)}</p>
            {s.link.photos && s.link.photos.length > 0 && (
              <div className="rg-photos">
                <PhotoSlider photos={s.link.photos} />
              </div>
            )}
          </div>
        ))}

        <div className="rg-goal">
          <div className="rg-goal-icon">ゴール</div>
          <div className="rg-goal-name">{last.name}</div>
          <button className="btn-back-home" onClick={onClose}>目的地選択に戻る</button>
        </div>
      </div>
    </div>
  );
};
