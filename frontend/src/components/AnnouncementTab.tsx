import React, { useEffect, useRef, useState } from "react";
import { Announcement } from "../types";
import { api } from "../api/client";

const BASE = import.meta.env.VITE_API_URL ?? "";

/**
 * お知らせ（POP画像）の管理タブ。
 * 画像＋文言＋リンクを登録し、有効化するとユーザーがアプリを開いた最初に POP 表示される
 * （カメラ・コンパスの許可要求より前）。有効にできるのは同時に1件。
 */
export function AnnouncementTab() {
  const [list, setList] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [activateNow, setActivateNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.announcements.list().then(setList).catch(() => {}); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const onPick = (f: File | null) => {
    setFile(f);
    setMsg(null);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ""; });
  };

  const create = async () => {
    if (!file) { setMsg({ type: "err", text: "POP画像を選択してください" }); return; }
    setSaving(true); setMsg(null);
    try {
      const form = new FormData();
      form.append("image", file, file.name || "announce.png");
      form.append("title", title.trim());
      form.append("body", body.trim());
      form.append("link_url", linkUrl.trim());
      form.append("is_active", activateNow ? "true" : "false");
      const created = await api.announcements.create(form);
      // 有効化した場合は他が無効になるので一覧を取り直す
      const fresh = activateNow ? await api.announcements.list() : [created, ...list];
      setList(fresh);
      setTitle(""); setBody(""); setLinkUrl(""); onPick(null);
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ type: "ok", text: "お知らせを登録しました" });
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setSaving(false); }
  };

  const activate = async (id: number) => {
    try {
      await api.announcements.activate(id);
      setList((p) => p.map((a) => ({ ...a, is_active: a.id === id })));
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };
  const deactivate = async (id: number) => {
    try {
      await api.announcements.deactivate(id);
      setList((p) => p.map((a) => (a.id === id ? { ...a, is_active: false } : a)));
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };
  const del = async (id: number) => {
    if (!window.confirm("このお知らせを削除しますか？")) return;
    try {
      await api.announcements.delete(id);
      setList((p) => p.filter((a) => a.id !== id));
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>お知らせ（POP）を登録</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
        <p className="hint" style={{ marginBottom: 12 }}>
          ユーザーがアプリ（リンク）を開いた最初に、この画像を POP 表示します（カメラ・コンパスの許可要求より前）。
          有効にできるのは同時に1件です。
        </p>

        <div className="adm-field">
          <label>POP画像 <span className="req">*</span></label>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          {previewUrl && <img src={previewUrl} alt="プレビュー" className="demo-upload-preview" />}
        </div>
        <div className="adm-field">
          <label>タイトル（任意）</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 本日のお知らせ" />
        </div>
        <div className="adm-field">
          <label>本文（任意）</label>
          <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="POPに添える説明文" />
        </div>
        <div className="adm-field">
          <label>リンクURL（任意）</label>
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="例: https://example.com/detail" />
          <p className="hint">入力すると POP に「詳しく見る」リンクが表示されます。</p>
        </div>
        <div className="adm-field">
          <label className="adm-checkbox-label">
            <input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} />
            登録と同時に有効化する（他のお知らせは無効になります）
          </label>
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={create} disabled={!file || saving}>
            {saving ? "登録中..." : "登録"}
          </button>
        </div>
      </div>

      <div className="adm-list-col">
        <h3>登録済みお知らせ <span className="count-badge">{list.length}</span></h3>
        {list.length === 0 ? (
          <p className="adm-empty">まだ登録がありません</p>
        ) : (
          <div className="ar-feature-list">
            {list.map((a) => (
              <div key={a.id} className={`ar-feature-card${a.is_active ? " announce-active" : ""}`}>
                <img src={`${BASE}${a.image_url}`} alt={a.title || "お知らせ"} className="ar-feature-thumb" />
                <div className="ar-feature-info">
                  <strong>{a.title || "(タイトルなし)"}</strong>
                  {a.body && <span className="ar-feature-meta">{a.body}</span>}
                  {a.link_url && <span className="ar-feature-meta">🔗 {a.link_url}</span>}
                  {a.is_active
                    ? <span className="announce-badge-on">表示中</span>
                    : <span className="text-muted" style={{ fontSize: 12 }}>非表示</span>}
                </div>
                <div className="adm-row-actions">
                  {a.is_active
                    ? <button className="btn-secondary" onClick={() => deactivate(a.id)}>非表示にする</button>
                    : <button className="btn-edit" onClick={() => activate(a.id)}>表示する</button>}
                  <button className="btn-del" onClick={() => del(a.id)}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
