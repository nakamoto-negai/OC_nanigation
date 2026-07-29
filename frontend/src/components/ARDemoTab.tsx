import React, { useEffect, useMemo, useRef, useState } from "react";
import { DemoOverlay, Node, RouteStepDetail } from "../types";
import { api } from "../api/client";
import { ARNavGuide } from "./ARNavGuide";
import { useCompass, armCompassAutoRequest } from "../hooks/useCompass";

const BASE = import.meta.env.VITE_API_URL ?? "";

// ARNavGuide のレイアウトを出すためだけのダミーステップ（現在地→目的地）。
// 実ルートは無いので、方位はマップ座標ベースで適当な向き（上方向）にしておく。
const DEMO_STEP = {
  step_number: 1,
  link: { id: 0, name: "", description: "", from_node_id: 0, to_node_id: 0, distance: 0, photos: [], created_at: "", updated_at: "" },
  from_node: {
    id: 0, name: "現在地", description: "", x: 0, y: 0, lat: null, lng: null,
    category_id: null, is_selectable: true, congestion_level: 0, wait_time: 0,
    created_at: "", updated_at: "", photos: [],
  },
  to_node: {
    id: 0, name: "目的地", description: "", x: 0, y: -100, lat: null, lng: null,
    category_id: null, is_selectable: true, congestion_level: 0, wait_time: 0,
    created_at: "", updated_at: "", photos: [],
  },
} as unknown as RouteStepDetail;

/**
 * 道案内ARのデモ画面づくり用ツール（管理画面限定）。
 * 管理者が登録した画像を「カメラの代わり」に使い、ホームの道案内AR画面と同じレイアウト
 * （ヘッダー・目的地/現在地の選択・方向矢印など）を画面全体に再現してプレビューできる。
 * AdminPage 内でのみ使うため、ユーザーアプリからはアクセスできない。
 */
export function ARDemoTab({ nodes }: { nodes: Node[] }) {
  const [overlays, setOverlays] = useState<DemoOverlay[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 全画面デモを表示中か
  const [demoOpen, setDemoOpen] = useState(false);

  // 道案内ARと同じ矢印を出すためのコンパス（許可・heading は共有シングルトン）
  const compass = useCompass();

  // デモ画面の「現在地／目的地」選択の見た目用（実際の経路計算はしない）。
  // 目的地モデル化に伴い is_selectable は廃止したため、ここでは全ノードを候補にする。
  const selectable = useMemo(() => nodes, [nodes]);
  const [demoStartId, setDemoStartId] = useState<number | "">("");
  const [demoDestId, setDemoDestId] = useState<number | "">("");
  useEffect(() => {
    if (nodes.length === 0) return;
    setDemoStartId((v) => (v === "" ? nodes[0].id : v));
    setDemoDestId((v) => (v === "" ? (selectable.find((n) => n.id !== nodes[0].id)?.id ?? "") : v));
  }, [nodes, selectable]);
  const startName = nodes.find((n) => n.id === demoStartId)?.name ?? "現在地";
  const destNode = nodes.find((n) => n.id === demoDestId) ?? null;
  const destName = destNode?.name ?? "目的地";

  // 管理画面にはお知らせPOPが無いので、デモの矢印用にコンパス自動許可を解禁しておく
  useEffect(() => { armCompassAutoRequest(); }, []);
  useEffect(() => { api.demoOverlays.list().then(setOverlays).catch(() => {}); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  const onPick = (f: File | null) => {
    setFile(f);
    setMsg(null);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ""; });
  };

  const upload = async () => {
    if (!file) { setMsg({ type: "err", text: "画像を選択してください" }); return; }
    setSaving(true); setMsg(null);
    try {
      const form = new FormData();
      form.append("image", file, file.name || "demo.png");
      form.append("name", name.trim() || `デモ画像 ${new Date().toLocaleString("ja-JP")}`);
      const created = await api.demoOverlays.upload(form);
      setOverlays((p) => [created, ...p]);
      setSelectedId(created.id);
      setName(""); onPick(null);
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ type: "ok", text: "画像を登録しました" });
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
    finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!window.confirm("この画像を削除しますか？")) return;
    try {
      await api.demoOverlays.delete(id);
      setOverlays((p) => p.filter((o) => o.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e: any) { setMsg({ type: "err", text: e.message }); }
  };

  return (
    <>
    <div className="adm-layout">
      <div className="adm-form-col">
        <h3>ARデモ（管理画面限定）</h3>
        {msg && <div className={`adm-msg ${msg.type}`} onClick={() => setMsg(null)}>{msg.text} ✕</div>}
        <p className="hint" style={{ marginBottom: 12 }}>
          画像を登録して選び「デモ画面開始」を押すと、ホームの道案内AR画面と同じレイアウト
          （ヘッダー・目的地/現在地の選択・方向矢印など）を画面全体に再現し、カメラ部分がその画像になります。
          この画面は管理画面からのみアクセスできます。
        </p>

        {/* アップロード */}
        <div className="adm-field">
          <label>画像</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          {previewUrl && <img src={previewUrl} alt="プレビュー" className="demo-upload-preview" />}
        </div>
        <div className="adm-field">
          <label>名前（任意）</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 廊下のデモ" />
        </div>
        <div className="adm-actions">
          <button className="btn-primary" onClick={upload} disabled={!file || saving}>
            {saving ? "登録中..." : "画像を登録"}
          </button>
        </div>

        {/* 登録済み一覧 */}
        <h3 style={{ marginTop: 20 }}>登録画像 <span className="count-badge">{overlays.length}</span></h3>
        {overlays.length === 0 ? (
          <p className="adm-empty">まだ登録がありません</p>
        ) : (
          <div className="demo-overlay-list">
            {overlays.map((o) => (
              <div key={o.id} className={`demo-overlay-item${selectedId === o.id ? " selected" : ""}`}>
                <button className="demo-overlay-pick" onClick={() => setSelectedId(o.id)}>
                  <img src={`${BASE}${o.image_url}`} alt={o.name} className="demo-overlay-thumb" />
                  <span className="demo-overlay-name">{o.name}</span>
                </button>
                <button className="btn-del" onClick={() => del(o.id)}>削除</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* デモ画面プレビュー＋全画面開始ボタン */}
      <div className="adm-list-col">
        <h3>デモ画面</h3>
        {selected ? (
          <>
            <div className="ar-camera-wrap">
              <img className="arnav-video" src={`${BASE}${selected.image_url}`} alt="" />
            </div>
            <div className="adm-actions" style={{ marginTop: 12 }}>
              <button className="btn-primary" onClick={() => setDemoOpen(true)}>▶ デモ画面開始（全画面）</button>
              <span className="ar-feature-meta">選択中: {selected.name}</span>
            </div>
            <p className="hint">押すと、ホームの道案内AR画面と同じレイアウトのまま画面全体に広がります。</p>
          </>
        ) : (
          <div className="ar-camera-wrap">
            <div className="ar-camera-placeholder">左で画像を選択してください</div>
          </div>
        )}
      </div>
    </div>

    {/* 全画面デモ：ホームの道案内AR画面（ヘッダー＋目的地/現在地選択＋AR）を丸ごと再現。カメラ部分＝選択画像 */}
    {demoOpen && selected && (
      <div className="demo-fullscreen">
        <div className="app">
          {/* ヘッダー（App.tsx のユーザーアプリと同じ） */}
          <header className="app-header">
            <span className="header-spacer" />
            <div className="header-actions">
              <span className="cafeteria-congestion" title="食堂の混雑度">
                <span className="cafeteria-congestion-label">食堂</span>
                <span className="cafeteria-congestion-badge" style={{ background: "#f59e0b" }}>普通</span>
              </span>
              <button onClick={() => setDemoOpen(false)}>← 戻る</button>
            </div>
          </header>

          {/* ホームの案内中レイアウト */}
          <div className="home-page guiding">
            <p className="home-dest-prompt">自分の行きたい目的地を選択してください</p>

            <div className="loc-dest-row">
              {/* 現在地バナー（先に表示する） */}
              <div className="location-banner found">
                <div className="loc-text">
                  <div className="loc-label-row">
                    <span className="loc-label">現在地（自動検出）</span>
                    <button type="button" className="loc-reload-btn" aria-label="現在地を再読み込み" title="現在地を再読み込み">
                      <span className="loc-reload-icon">↻</span>
                      <span className="loc-reload-text">再読み込み</span>
                    </button>
                  </div>
                </div>
                <div className="loc-select-group">
                  <select
                    className="loc-manual-select"
                    value={demoStartId}
                    onChange={(e) => setDemoStartId(Number(e.target.value) || "")}
                  >
                    <option value="">現在地を選択...</option>
                    {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 現在地 → 目的地 の矢印 */}
              <div className="loc-dest-arrow" aria-hidden="true">→</div>

              {/* 目的地バナー */}
              <div className="dest-banner">
                <div className="loc-text">
                  <span className="loc-label">目的地を選択</span>
                </div>
                <button type="button" className="loc-manual-select dest-picker-btn">
                  <span>{destNode ? destNode.name : "目的地を選択..."}</span>
                  <span className="dest-picker-caret">▼</span>
                </button>
              </div>
            </div>

            {/* 道案内カード：見出し（ステップ番号＋「現在地 → 目的地」）＋AR。本番の埋め込みカードと同じ構成 */}
            <div className="rg-step-content">
              <div className="rg-step-header">
                <div className="rg-step-number">1</div>
                <div className="rg-step-title">
                  <span className="rg-from">{startName}</span>
                  <span className="rg-arrow">→</span>
                  <span className="rg-to">{destName}</span>
                </div>
                <span className="rg-ar-inline-hint">到着地点を確認してスクロール</span>
              </div>
              <ARNavGuide
                key={selected.id}
                demoImageUrl={`${BASE}${selected.image_url}`}
                step={DEMO_STEP}
                heading={compass.heading}
                permission={compass.permission}
                onRequestPermission={compass.requestPermission}
                userLat={null}
                userLng={null}
                mapNorthOffset={0}
                onClose={() => {}}
                onNext={() => {}}
              />
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
