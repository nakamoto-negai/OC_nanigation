import React, { useEffect, useRef, useState } from "react";
import { SurveyAnswerInput, SurveyPublic, SurveyQuestion } from "../types";
import { api } from "../api/client";
import { getDeviceId } from "../hooks/useUser";

interface Props {
  /** アプリ内アンケートの質問が無いときのフォールバック先（設定の外部URL）。 */
  fallbackUrl?: string;
  /** アンケート画面を閉じる（呼び出し元の画面へ戻る）。 */
  onClose: () => void;
}

// 全画面アンケートの外枠。ヘッダー（タイトル＋閉じる）とスクロール本文。
// モジュール直下に置くことで再レンダーごとの再マウント（入力フォーカス喪失）を防ぐ。
const SurveyShell: React.FC<{
  onClose: () => void;
  bodyRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}> = ({ onClose, bodyRef, children }) => (
  <div className="survey-screen fullscreen">
    <div className="survey-screen-header">
      <span className="survey-screen-title">アンケート</span>
      <button className="survey-screen-close" onClick={onClose}>✕ 閉じる</button>
    </div>
    <div className="survey-screen-body" ref={bodyRef}>{children}</div>
  </div>
);

// 指定した質問群の必須未回答をチェックし、最初のエラーメッセージを返す（無ければ null）。
function validatePage(
  qs: SurveyQuestion[],
  values: Record<number, number>,
  texts: Record<number, string>,
): string | null {
  for (const q of qs) {
    if (!q.required) continue;
    const hasLikert = q.type === "likert" && values[q.id] != null;
    const hasText = q.type === "text" && (texts[q.id] ?? "").trim() !== "";
    if (!hasLikert && !hasText) return `「${q.text}」は必須です`;
  }
  return null;
}

/**
 * アプリ内アンケートの全画面フォーム（/survey ルートの本体）。
 * - 起動時に有効な質問と回答済みフラグを取得する。
 * - 質問が無ければ外部URL（あれば）への導線／案内を表示する。
 * - 管理者が付けたページ番号でグルーピングし、「次へ / 戻る」で複数ページを進む。
 * - 同じ端末は1回のみ。回答済み／送信完了はお礼を表示する。
 */
export const SurveyForm: React.FC<Props> = ({ fallbackUrl, onClose }) => {
  const [data, setData] = useState<SurveyPublic | null>(null);
  const [answered, setAnswered] = useState(false);
  const [values, setValues] = useState<Record<number, number>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.survey
      .get(getDeviceId())
      .then((res) => { if (!cancelled) { setData(res); setAnswered(res.answered); } })
      .catch(() => { if (!cancelled) setData({ questions: [], answered: false }); });
    return () => { cancelled = true; };
  }, []);

  // 読み込み中
  if (data === null) {
    return <SurveyShell onClose={onClose}><p className="sv-info">読み込み中…</p></SurveyShell>;
  }

  const questions = data.questions;

  // 質問が無い（外部URLがあれば案内、無ければメッセージ）
  if (questions.length === 0) {
    return (
      <SurveyShell onClose={onClose}>
        <div className="sv-info-box">
          {fallbackUrl ? (
            <>
              <p className="sv-info">アンケートは外部フォームからご回答いただけます。</p>
              <a className="sv-submit" href={fallbackUrl} target="_blank" rel="noopener noreferrer">
                アンケートを開く
              </a>
            </>
          ) : (
            <p className="sv-info">現在受付中のアンケートはありません。</p>
          )}
          <button className="sv-back sv-info-close" onClick={onClose}>閉じる</button>
        </div>
      </SurveyShell>
    );
  }

  // 回答済み or 送信完了ならお礼
  if (answered || done) {
    return (
      <SurveyShell onClose={onClose}>
        <div className="sv-thanks">
          <span className="sv-thanks-check">✓</span>
          <span className="sv-thanks-text">アンケートにご協力ありがとうございました</span>
          <button className="sv-submit sv-thanks-close" onClick={onClose}>閉じる</button>
        </div>
      </SurveyShell>
    );
  }

  // 管理者が各質問に付けたページ番号でグルーピングする。
  // 実在するページ番号を昇順に並べ、その並びのインデックスを「現在ページ」とする。
  const pageNumbers = Array.from(new Set(questions.map((q) => q.page))).sort((a, b) => a - b);
  const pageCount = pageNumbers.length;
  const currentPageNo = pageNumbers[Math.min(page, pageCount - 1)];
  const pageQuestions = questions.filter((q) => q.page === currentPageNo);
  const isLastPage = page >= pageCount - 1;

  // ページ切替時は先頭までスクロールを戻す。
  const goToPage = (p: number) => {
    setError(null);
    setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const next = () => {
    const err = validatePage(pageQuestions, values, texts);
    if (err) { setError(err); return; }
    goToPage(page + 1);
  };

  const submit = async () => {
    // 全ページの必須チェック（現在ページ以外も含めて念のため確認）
    const err = validatePage(questions, values, texts);
    if (err) { setError(err); return; }

    const answers: SurveyAnswerInput[] = [];
    for (const q of questions) {
      if (q.type === "likert" && values[q.id] != null) {
        answers.push({ question_id: q.id, value: values[q.id] });
      } else if (q.type === "text" && (texts[q.id] ?? "").trim() !== "") {
        answers.push({ question_id: q.id, text: texts[q.id].trim() });
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.survey.submit(getDeviceId(), answers);
      setDone(true);
    } catch (e: any) {
      // 既に回答済み（409）ならお礼表示に切り替える
      if (String(e.message).includes("already answered")) {
        setAnswered(true);
      } else {
        setError("送信に失敗しました。通信環境をご確認ください");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurveyShell onClose={onClose} bodyRef={scrollRef}>
      <div className="sv-form">
        <h3 className="sv-form-title">アンケートにご協力ください</h3>
        {pageCount > 1 && (
          <div className="sv-progress">
            <div className="sv-progress-bar">
              <div className="sv-progress-fill" style={{ width: `${((page + 1) / pageCount) * 100}%` }} />
            </div>
            <span className="sv-progress-text">ページ {page + 1} / {pageCount}</span>
          </div>
        )}
        {pageQuestions.map((q) => (
          <div key={q.id} className="sv-q">
            <div className="sv-q-text">
              {q.text}
              {q.required && <span className="sv-q-req">必須</span>}
            </div>

            {q.type === "likert" ? (
              <>
                <div className="sv-likert" role="radiogroup" aria-label={q.text}>
                  {Array.from({ length: q.scale_max }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`sv-likert-opt${values[q.id] === n ? " selected" : ""}`}
                      aria-pressed={values[q.id] === n}
                      onClick={() => setValues((p) => ({ ...p, [q.id]: n }))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {(q.min_label || q.max_label) && (
                  <div className="sv-likert-labels">
                    <span>{q.min_label}</span>
                    <span>{q.max_label}</span>
                  </div>
                )}
              </>
            ) : (
              <textarea
                className="sv-textarea"
                rows={3}
                value={texts[q.id] ?? ""}
                onChange={(e) => setTexts((p) => ({ ...p, [q.id]: e.target.value }))}
                placeholder="ご自由にご記入ください"
              />
            )}
          </div>
        ))}

        {error && <div className="sv-error">{error}</div>}

        <div className="sv-nav">
          {page > 0 && (
            <button className="sv-back" onClick={() => goToPage(page - 1)} disabled={submitting}>
              ← 戻る
            </button>
          )}
          {isLastPage ? (
            <button className="sv-submit" onClick={submit} disabled={submitting}>
              {submitting ? "送信中…" : "回答を送信する"}
            </button>
          ) : (
            <button className="sv-submit" onClick={next}>
              次へ →
            </button>
          )}
        </div>
      </div>
    </SurveyShell>
  );
};
