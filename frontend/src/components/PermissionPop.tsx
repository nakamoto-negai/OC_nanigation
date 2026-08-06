import React from "react";

interface Props {
  /** 「有効にする」タップ時（ユーザー操作内でカメラ・方位センサーの許可要求を呼ぶ） */
  onEnable: () => void;
  /** 「今はしない」タップ時（何もせず閉じる） */
  onDismiss: () => void;
}

/**
 * 起動時（お知らせPOPを閉じた直後）に、カメラと方位センサーの利用許可をまとめて求めるポップアップ。
 * iOS はユーザー操作内でしか許可要求できないため、「有効にする」のタップを起点に両方の許可を要求する。
 * どちらを選んでもこの滞在中は再表示しない（呼び出し側で管理）。
 */
export const PermissionPop: React.FC<Props> = ({ onEnable, onDismiss }) => {
  return (
    <div className="compass-pop-overlay">
      <div className="compass-pop">
        <div className="perm-pop-icons">
          {/* カメラ */}
          <svg className="compass-pop-icon" viewBox="0 0 100 100" role="img" aria-label="カメラ">
            <rect x="12" y="28" width="76" height="52" rx="10" fill="#eff6ff" stroke="#3b82f6" strokeWidth="3" />
            <path d="M38 28 l6 -10 h12 l6 10 z" fill="#eff6ff" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="50" cy="54" r="15" fill="#fff" stroke="#3b82f6" strokeWidth="3" />
            <circle cx="50" cy="54" r="6" fill="#3b82f6" />
          </svg>
          {/* 方位センサー */}
          <svg className="compass-pop-icon" viewBox="0 0 100 100" role="img" aria-label="コンパス">
            <circle cx="50" cy="50" r="44" fill="#eff6ff" stroke="#3b82f6" strokeWidth="3" />
            <polygon points="50,16 60,50 50,44 40,50" fill="#ef4444" />
            <polygon points="50,84 60,50 50,56 40,50" fill="#94a3b8" />
            <circle cx="50" cy="50" r="4" fill="#1e293b" />
          </svg>
        </div>
        <h2 className="compass-pop-title">カメラと方位センサーを使いますか？</h2>
        <p className="compass-pop-text">
          「かざして調べる」やAR道案内でカメラを、「進む方向」を正しく表示するために方位センサー（コンパス）を使用します。
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
