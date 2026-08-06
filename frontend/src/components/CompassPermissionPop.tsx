import React from "react";

interface Props {
  /** 「有効にする」タップ時（ユーザー操作内でコンパス許可要求を呼ぶ） */
  onEnable: () => void;
  /** 「今はしない」タップ時（何もせず閉じる） */
  onDismiss: () => void;
}

/**
 * 起動時（お知らせPOPを閉じた直後）に、iOSで方位センサー未許可のときだけ出す確認ポップアップ。
 * iOS はユーザー操作内でしか許可要求できないため、「有効にする」のタップを起点に許可要求する。
 * （カメラはブラウザ標準ダイアログが必ず出るため、この前置きは出さず実際に使う場面で1回だけ許可を求める。）
 */
export const CompassPermissionPop: React.FC<Props> = ({ onEnable, onDismiss }) => {
  return (
    <div className="compass-pop-overlay">
      <div className="compass-pop">
        <svg className="compass-pop-icon" viewBox="0 0 100 100" role="img" aria-label="コンパス">
          <circle cx="50" cy="50" r="44" fill="#eff6ff" stroke="#3b82f6" strokeWidth="3" />
          {/* 方位針 */}
          <polygon points="50,16 60,50 50,44 40,50" fill="#ef4444" />
          <polygon points="50,84 60,50 50,56 40,50" fill="#94a3b8" />
          <circle cx="50" cy="50" r="4" fill="#1e293b" />
        </svg>
        <h2 className="compass-pop-title">方位センサーを使いますか？</h2>
        <p className="compass-pop-text">
          AR道案内で「進む方向」を正しく表示するために、方位センサー（コンパス）を使用します。
          有効にすると、続けて表示される許可ダイアログで「許可」を選んでください。
        </p>
        <div className="compass-pop-actions">
          <button className="compass-pop-enable" onClick={onEnable}>有効にする</button>
          <button className="compass-pop-later" onClick={onDismiss}>今はしない</button>
        </div>
      </div>
    </div>
  );
};
