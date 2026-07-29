import React from "react";
import { Announcement } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  announcement: Announcement;
  onClose: () => void;
}

/**
 * アプリ（リンク）を開いたとき最初に表示するお知らせ POP。
 * カメラ・コンパスの許可要求よりも前に表示する（許可の自動要求は閉じた後に解禁される）。
 */
export const AnnouncementPop: React.FC<Props> = ({ announcement, onClose }) => {
  const { title, body, image_url, link_url } = announcement;
  return (
    <div className="announce-pop-overlay" onClick={onClose}>
      <div className="announce-pop" onClick={(e) => e.stopPropagation()}>
        <button className="announce-pop-close" onClick={onClose} aria-label="閉じる">×</button>
        {image_url && (
          <img className="announce-pop-img" src={`${BASE}${image_url}`} alt={title || "お知らせ"} />
        )}
        {(title || body) && (
          <div className="announce-pop-text">
            {title && <h2 className="announce-pop-title">{title}</h2>}
            {body && <p className="announce-pop-body">{body}</p>}
          </div>
        )}
        <div className="announce-pop-actions">
          {link_url && (
            <a className="announce-pop-link" href={link_url} target="_blank" rel="noopener noreferrer">
              詳しく見る
            </a>
          )}
          <button className="announce-pop-ok" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
};
