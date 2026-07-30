import React, { useEffect, useState } from "react";
import { Cafeteria } from "../types";
import { api } from "../api/client";
import { CAFETERIA_CONGESTION_LABELS, CAFETERIA_CONGESTION_COLORS } from "../utils/congestion";

interface Props {
  onLogout: () => void;
}

/**
 * 食堂編集用アカウント向けの画面。登録済みの各食堂の混雑度だけを編集できる。
 * 選択肢をタップするとその食堂の混雑度がその場で保存される。
 * 食堂の追加・削除・名前変更は管理画面（管理者）で行う。
 */
export const CafeteriaPage: React.FC<Props> = ({ onLogout }) => {
  const [cafeterias, setCafeterias] = useState<Cafeteria[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.cafeterias.list()
      .then(setCafeterias)
      .catch(() => { /* 取得失敗時は空のまま */ })
      .finally(() => setLoading(false));
  }, []);

  const save = async (id: number, level: number) => {
    setSavingId(id);
    setMsg(null);
    try {
      const updated = await api.cafeterias.updateCongestion(id, level);
      setCafeterias((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setMsg({ type: "ok", text: `「${updated.name}」を保存しました` });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "保存に失敗しました" });
    } finally {
      setSavingId(null);
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
        ) : cafeterias.length === 0 ? (
          <p className="adm-empty">食堂が登録されていません（管理画面で登録してください）</p>
        ) : (
          <>
            {msg && (
              <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>
                {msg.text} ✕
              </div>
            )}
            <p className="hint">各食堂の今の混雑度を選んでください（タップですぐ反映されます）。</p>
            {cafeterias.map((cafe) => (
              <div key={cafe.id} className="cafeteria-card">
                <div className="cafeteria-card-head">
                  <span className="cafeteria-card-name">{cafe.name}</span>
                  <span
                    className="cafeteria-current-badge"
                    style={{ background: CAFETERIA_CONGESTION_COLORS[cafe.congestion_level] }}
                  >
                    {CAFETERIA_CONGESTION_LABELS[cafe.congestion_level]}
                  </span>
                </div>
                <div className="cafeteria-choices">
                  {CAFETERIA_CONGESTION_LABELS.map((label, i) => (
                    <button
                      key={i}
                      className={`cafeteria-choice${cafe.congestion_level === i ? " selected" : ""}`}
                      disabled={savingId === cafe.id}
                      style={{
                        borderColor: CAFETERIA_CONGESTION_COLORS[i],
                        color: cafe.congestion_level === i ? "#fff" : CAFETERIA_CONGESTION_COLORS[i],
                        background: cafe.congestion_level === i ? CAFETERIA_CONGESTION_COLORS[i] : "#fff",
                      }}
                      onClick={() => save(cafe.id, i)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
