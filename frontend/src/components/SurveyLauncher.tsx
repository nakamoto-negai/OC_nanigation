import React, { useEffect, useState } from "react";
import { SurveyPublic } from "../types";
import { api } from "../api/client";
import { getDeviceId } from "../hooks/useUser";

interface Props {
  /** アプリ内アンケートの質問が無いときのフォールバック先（設定の外部URL）。 */
  fallbackUrl?: string;
  /** アプリ内アンケート（/survey）へ遷移する。 */
  onOpen: () => void;
}

/**
 * 到着カードに置くアンケートの入口ボタン。
 * - 有効な質問が1つ以上あれば「アンケートにご協力お願いします」ボタンを表示し、
 *   押すと /survey ルート（アプリ内アンケート画面）へ遷移する。
 * - 質問が無ければ、従来どおり設定の外部URLを新しいタブで開くリンクにフォールバックする。
 * - どちらも無ければ何も表示しない。
 */
export const SurveyLauncher: React.FC<Props> = ({ fallbackUrl, onOpen }) => {
  const [data, setData] = useState<SurveyPublic | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.survey
      .get(getDeviceId())
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData({ questions: [], answered: false }); });
    return () => { cancelled = true; };
  }, []);

  if (data === null) return null;

  if (data.questions.length === 0) {
    if (!fallbackUrl) return null;
    return (
      <a className="btn-survey" href={fallbackUrl} target="_blank" rel="noopener noreferrer">
        アンケートにご協力お願いします
      </a>
    );
  }

  return (
    <button className="btn-survey" onClick={onOpen}>
      アンケートにご協力お願いします
    </button>
  );
};
