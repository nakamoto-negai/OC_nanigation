import React, { useEffect, useState } from "react";
import { api } from "../api/client";

// 混雑度: 0=不明, 1=空き, 2=普通, 3=混雑
const LABELS = ["不明", "空き", "普通", "混雑"] as const;
const COLORS = ["#94a3b8", "#22c55e", "#f59e0b", "#ef4444"] as const;

interface Props {
  onLogout: () => void;
}

/**
 * 食堂編集用アカウント向けの画面。食堂の混雑度だけを編集できる。
 * 選択肢をタップするとその場で保存する。
 */
export const CafeteriaPage: React.FC<Props> = ({ onLogout }) => {
  const [level, setLevel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.settings.get()
      .then((s) => setLevel(s.cafeteria_congestion ?? 0))
      .catch(() => { /* 取得失敗時は不明のまま */ })
      .finally(() => setLoading(false));
  }, []);

  const save = async (lv: number) => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.cafeteria.updateCongestion(lv);
      setLevel(r.cafeteria_congestion);
      setMsg({ type: "ok", text: "保存しました" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "保存に失敗しました" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>食堂の混雑度</h1>
        <nav>
          <button onClick={onLogout}>ログアウト</button>
        </nav>
      </header>

      <div className="cafeteria-editor">
        {loading ? (
          <p className="adm-empty">読み込み中...</p>
        ) : (
          <>
            <p className="cafeteria-current">
              現在の混雑度：
              <span className="cafeteria-current-badge" style={{ background: COLORS[level] }}>
                {LABELS[level]}
              </span>
            </p>
            {msg && (
              <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
                {msg.text} ✕
              </div>
            )}
            <p className="hint">下から今の混雑度を選んでください（タップですぐ反映されます）。</p>
            <div className="cafeteria-choices">
              {LABELS.map((label, i) => (
                <button
                  key={i}
                  className={`cafeteria-choice${level === i ? " selected" : ""}`}
                  disabled={saving}
                  style={{
                    borderColor: COLORS[i],
                    color: level === i ? "#fff" : COLORS[i],
                    background: level === i ? COLORS[i] : "#fff",
                  }}
                  onClick={() => save(i)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
