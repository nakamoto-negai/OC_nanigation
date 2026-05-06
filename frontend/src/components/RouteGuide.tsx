import React, { useState } from "react";
import { RouteResponse, RouteStepDetail } from "../types";
import { PhotoSlider } from "./PhotoSlider";

interface Props {
  route: RouteResponse;
  onClose: () => void;
}

export const RouteGuide: React.FC<Props> = ({ route, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const step: RouteStepDetail | undefined = route.steps[currentStep];
  const isLast = currentStep === route.steps.length - 1;

  return (
    <div className="route-guide fullscreen">
      {/* ヘッダー */}
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

      {/* ボディ */}
      <div className="route-guide-body">
        {/* ステップリスト */}
        <div className="step-list">
          {route.steps.map((s, i) => (
            <div
              key={i}
              className={`step-item ${i === currentStep ? "active" : ""}`}
              onClick={() => setCurrentStep(i)}
            >
              <div className="step-number">{s.step_number}</div>
              <div className="step-info">
                <div className="step-nodes">
                  <span className="step-from">{s.from_node.name}</span>
                  <span className="step-arrow">→</span>
                  <span className="step-to">{s.to_node.name}</span>
                </div>
                {s.link.name && <div className="step-link-name">{s.link.name}</div>}
                <div className="step-distance">距離: {s.link.distance.toFixed(1)}</div>
              </div>
              {s.link.photos && s.link.photos.length > 0 && (
                <span className="photo-badge">{s.link.photos.length}枚</span>
              )}
            </div>
          ))}
        </div>

        {/* ステップ詳細 */}
        {step && (
          <div className="step-detail">
            <div className="step-detail-header">
              <h2>
                ステップ {step.step_number}: {step.from_node.name} → {step.to_node.name}
              </h2>
              {step.link.name && <p className="step-link-label">{step.link.name}</p>}
              {step.link.description && (
                <p className="step-description">{step.link.description}</p>
              )}
              <p className="step-dist-detail">距離: {step.link.distance.toFixed(1)}</p>
            </div>

            <div className="step-photos">
              <PhotoSlider photos={step.link.photos ?? []} />
            </div>

            <div className="step-nav-buttons">
              <button
                disabled={currentStep === 0}
                onClick={() => setCurrentStep((s) => s - 1)}
              >
                ◀ 前のステップ
              </button>
              <span className="step-counter">
                {currentStep + 1} / {route.steps.length}
              </span>
              <button
                disabled={isLast}
                onClick={() => setCurrentStep((s) => s + 1)}
              >
                次のステップ ▶
              </button>
            </div>

            {isLast && (
              <div className="goal-reached">
                <span>ゴール到着: {route.node_path[route.node_path.length - 1].name}</span>
                <button className="btn-back-home" onClick={onClose}>目的地選択に戻る</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
