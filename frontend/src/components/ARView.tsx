import React from "react";
import { Node } from "../types";
import { ARRecognizer } from "./ARRecognizer";

interface Props {
  nodes: Node[];
}

/**
 * ユーザー向け「かざして調べる」画面。
 * 現在地による絞り込みは行わず、カメラに写した対象を認識して
 * 簡易詳細（説明＋リンク）をカメラ下部に直接表示する。
 */
export const ARView: React.FC<Props> = () => {
  return (
    <div className="ar-view-screen">
      <p className="ar-view-hint">
        カメラを対象に向けると、登録済みの対象を認識して説明とリンクを表示します。
      </p>
      <ARRecognizer />
    </div>
  );
};
