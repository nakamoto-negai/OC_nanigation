import React, { useEffect, useRef, useState } from "react";
import { ArrivalPhoto, Link, Photo } from "../types";
import { api } from "../api/client";
import { CompositeEditor } from "./CompositeEditor";

const BASE = import.meta.env.VITE_API_URL ?? "";

type Source = "upload" | "route" | "arrival";

/**
 * 管理画面の「画像合成」タブ。
 *  - アップロード画像: 任意の画像に合成素材を重ねて合成し、結果をダウンロードする。
 *  - 経路画像（道中写真）/ 到着画像: 既存の画像を選び、合成素材を重ねて「元の画像に上書き保存」する。
 * 合成素材は「合成素材」タブで事前に登録しておく。
 */
export function CompositeTab({ links }: { links: Link[] }) {
  const [source, setSource] = useState<Source>("upload");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // アップロードモード
  const [baseUrl, setBaseUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [uploadEditing, setUploadEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 既存画像モード
  const [linkId, setLinkId] = useState<number | "">("");
  const [routePhotos, setRoutePhotos] = useState<Photo[]>([]);
  const [arrivalPhotos, setArrivalPhotos] = useState<ArrivalPhoto[]>([]);
  // 合成→上書き中の対象（種別・URL・ID）
  const [editing, setEditing] = useState<{ kind: "route" | "arrival"; url: string; id: number } | null>(null);

  useEffect(() => () => { if (baseUrl) URL.revokeObjectURL(baseUrl); }, [baseUrl]);
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const linkLabel = (l: Link) =>
    l.from_node && l.to_node ? `${l.from_node.name} → ${l.to_node.name}` : (l.name || `リンク#${l.id}`);

  // リンク選択時に、そのリンクの経路写真・到着写真を読み込む
  useEffect(() => {
    if (linkId === "") { setRoutePhotos([]); setArrivalPhotos([]); return; }
    const l = links.find((x) => x.id === linkId);
    setRoutePhotos(l?.photos ?? []);
    api.arrivalPhotos.list(Number(linkId))
      .then(setArrivalPhotos)
      .catch(() => setArrivalPhotos(l?.arrival_photos ?? []));
  }, [linkId, links]);

  // 上書き後の再取得でブラウザキャッシュの古い画像を出さないためのバスター
  const bust = (url: string) => `${BASE}${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

  // アップロード画像の選択
  const onPickBase = (f: File | null) => {
    setMsg(null);
    setResultUrl((p) => { if (p) URL.revokeObjectURL(p); return ""; });
    setBaseUrl((p) => { if (p) URL.revokeObjectURL(p); return f ? URL.createObjectURL(f) : ""; });
  };

  // アップロード合成 → ダウンロード
  const saveDownload = async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    setResultUrl((p) => { if (p) URL.revokeObjectURL(p); return url; });
    const a = document.createElement("a");
    a.href = url; a.download = `composite_${Date.now()}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // 既存画像 合成 → 上書き保存
  const saveOverwrite = async (blob: Blob) => {
    if (!editing) return;
    const form = new FormData();
    form.append("photo", blob, "composite.jpg");
    if (editing.kind === "route") {
      const updated = await api.photos.replace(editing.id, form) as Photo;
      setRoutePhotos((p) => p.map((x) => (x.id === updated.id ? updated : x)));
    } else {
      const updated = await api.arrivalPhotos.replace(editing.id, form);
      setArrivalPhotos((p) => p.map((x) => (x.id === updated.id ? updated : x)));
    }
    setMsg({ type: "ok", text: "元の画像に上書き保存しました" });
  };

  return (
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>画像合成</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}

        <div className="sv-view-switch" style={{ marginBottom: 12 }}>
          <button className={source === "upload" ? "active" : ""} onClick={() => setSource("upload")}>アップロード画像</button>
          <button className={source === "route" ? "active" : ""} onClick={() => setSource("route")}>経路画像</button>
          <button className={source === "arrival" ? "active" : ""} onClick={() => setSource("arrival")}>到着画像</button>
        </div>

        {source === "upload" ? (
          <>
            <p className="hint">任意の画像に「合成素材」を重ねて合成し、結果をダウンロードします。</p>
            <div className="adm-field">
              <label>ベース画像</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={(e) => onPickBase(e.target.files?.[0] ?? null)} />
            </div>
            {baseUrl && (
              <>
                <div className="ar-camera-wrap">
                  <img className="arnav-video" src={baseUrl} alt="ベース画像" style={{ objectFit: "contain" }} />
                </div>
                <div className="adm-actions" style={{ marginTop: 12 }}>
                  <button className="btn-primary" onClick={() => setUploadEditing(true)}>合成する</button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="hint">
              リンクを選び、右の{source === "route" ? "経路（道中）画像" : "到着画像"}をクリックすると、
              合成素材を重ねて<strong>元の画像に上書き保存</strong>できます。
            </p>
            <div className="adm-field">
              <label>リンク</label>
              <select value={linkId} onChange={(e) => setLinkId(Number(e.target.value) || "")}>
                <option value="">選択してください</option>
                {links.map((l) => <option key={l.id} value={l.id}>{linkLabel(l)}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="adm-list-col">
        {source === "upload" && (
          <>
            <h3>合成結果</h3>
            {resultUrl ? (
              <>
                <img src={resultUrl} alt="合成結果" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <div className="adm-actions" style={{ marginTop: 12 }}>
                  <a className="btn-primary" href={resultUrl} download={`composite_${Date.now()}.jpg`}>もう一度ダウンロード</a>
                </div>
              </>
            ) : (
              <p className="adm-empty">合成するとここに結果が表示されます</p>
            )}
          </>
        )}

        {source === "route" && (
          <>
            <h3>経路画像（道中写真） <span className="count-badge">{routePhotos.length}</span></h3>
            {linkId === "" ? (
              <p className="adm-empty">リンクを選択してください</p>
            ) : routePhotos.length === 0 ? (
              <p className="adm-empty">このリンクに道中写真はありません</p>
            ) : (
              <div className="photo-grid">
                {routePhotos.map((p) => (
                  <div key={p.id} className="photo-card">
                    <img src={bust(p.url)} alt={p.caption || ""} />
                    <div className="photo-card-actions">
                      <button className="photo-card-composite" onClick={() => setEditing({ kind: "route", url: p.url, id: p.id })}>合成して上書き</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {source === "arrival" && (
          <>
            <h3>到着画像 <span className="count-badge">{arrivalPhotos.length}</span></h3>
            {linkId === "" ? (
              <p className="adm-empty">リンクを選択してください</p>
            ) : arrivalPhotos.length === 0 ? (
              <p className="adm-empty">このリンクに到着写真はありません</p>
            ) : (
              <div className="photo-grid">
                {arrivalPhotos.map((p) => (
                  <div key={p.id} className="photo-card">
                    <img src={bust(p.url)} alt={p.caption || ""} />
                    <div className="photo-card-actions">
                      <button className="photo-card-composite" onClick={() => setEditing({ kind: "arrival", url: p.url, id: p.id })}>合成して上書き</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* アップロード画像の合成（ダウンロード） */}
      {uploadEditing && baseUrl && (
        <CompositeEditor baseImageUrl={baseUrl} title="画像を合成" onClose={() => setUploadEditing(false)} onSave={saveDownload} />
      )}
      {/* 既存の経路/到着画像の合成 → 上書き保存 */}
      {editing && (
        <CompositeEditor
          baseImageUrl={editing.url}
          title={editing.kind === "route" ? "経路画像に合成して上書き" : "到着画像に合成して上書き"}
          onClose={() => setEditing(null)}
          onSave={saveOverwrite}
        />
      )}
    </div>
  );
}
