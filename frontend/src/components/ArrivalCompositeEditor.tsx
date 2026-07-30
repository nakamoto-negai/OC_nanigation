import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrivalPhoto, OverlayImage } from "../types";
import { api } from "../api/client";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  /** 合成のベースになる既存の到着地点写真 */
  photo: ArrivalPhoto;
  onClose: () => void;
  /** 上書き保存が成功したとき、更新後の写真を親へ返す */
  onSaved: (updated: ArrivalPhoto) => void;
}

// 画像を読み込んで <img> 要素を返す（キャンバス合成用）。
// 画像は /uploads 同一オリジン配信のためタイント（汚染）されず、canvas から書き出せる。
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = src;
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 到着地点写真に「合成用写真」を重ねて1枚に合成し、上書き保存するエディタ（管理者のみ）。
 * 合成用写真は事前に「合成素材」タブで登録しておき、ここで選んで移動・拡大縮小できる。
 * 保存するとキャンバスで平坦化し、同じ到着写真レコードを差し替える（上書き）。
 */
export const ArrivalCompositeEditor: React.FC<Props> = ({ photo, onClose, onSaved }) => {
  const [overlays, setOverlays] = useState<OverlayImage[]>([]);
  const [selected, setSelected] = useState<OverlayImage | null>(null);
  // 重ねる写真の中心位置（ベースに対する 0..1 の割合）と大きさ（ベース幅に対する割合）。
  const [cx, setCx] = useState(0.5);
  const [cy, setCy] = useState(0.5);
  const [scale, setScale] = useState(0.4);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  // ドラッグ開始時の状態
  const dragRef = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    api.overlayImages.list().then(setOverlays).catch(() => setOverlays([]));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!selected) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, cx, cy };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const stage = stageRef.current;
    if (!d || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setCx(clamp(d.cx + (e.clientX - d.px) / rect.width, 0, 1));
    setCy(clamp(d.cy + (e.clientY - d.py) / rect.height, 0, 1));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const save = useCallback(async () => {
    if (!selected) { setMsg("重ねる合成用写真を選んでください"); return; }
    setSaving(true);
    setMsg(null);
    try {
      const [baseImg, ovImg] = await Promise.all([
        loadImage(`${BASE}${photo.url}`),
        loadImage(`${BASE}${selected.url}`),
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas を初期化できませんでした");
      ctx.drawImage(baseImg, 0, 0);

      // 重ねる写真をベース解像度に合わせて描画（画面上の割合をそのまま適用）。
      const drawW = scale * canvas.width;
      const drawH = drawW * (ovImg.naturalHeight / ovImg.naturalWidth);
      const x = cx * canvas.width - drawW / 2;
      const y = cy * canvas.height - drawH / 2;
      ctx.drawImage(ovImg, x, y, drawW, drawH);

      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像の書き出しに失敗しました"))), "image/jpeg", 0.9),
      );

      const form = new FormData();
      form.append("photo", blob, "composite.jpg");
      const updated = await api.arrivalPhotos.replace(photo.id, form);
      onSaved(updated);
      onClose();
    } catch (e: any) {
      setMsg(e?.message ?? "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [selected, scale, cx, cy, photo, onSaved, onClose]);

  return (
    <div className="composite-overlay" onClick={onClose}>
      <div className="composite-modal" onClick={(e) => e.stopPropagation()}>
        <div className="composite-head">
          <h3>到着写真に合成</h3>
          <button className="dest-modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        {msg && <div className="adm-msg err" onClick={() => setMsg(null)}>{msg} ✕</div>}

        {/* プレビュー（ベース写真＋重ねる写真）。重ねる写真はドラッグで移動できる。 */}
        <div className="composite-stage" ref={stageRef}>
          <img className="composite-base" src={`${BASE}${photo.url}`} alt="" draggable={false} />
          {selected && (
            <img
              className="composite-ov"
              src={`${BASE}${selected.url}`}
              alt=""
              draggable={false}
              style={{
                left: `${cx * 100}%`,
                top: `${cy * 100}%`,
                width: `${scale * 100}%`,
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          )}
        </div>

        {/* 大きさスライダー（重ねる写真の幅＝ベース幅に対する割合） */}
        <div className="composite-controls">
          <label className="composite-scale">
            大きさ
            <input
              type="range"
              min={0.05}
              max={1.5}
              step={0.01}
              value={scale}
              disabled={!selected}
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </label>
          <p className="hint">重ねる写真はドラッグで移動できます。</p>
        </div>

        {/* 合成用写真の選択（事前に「合成素材」タブで登録したもの） */}
        <div className="composite-picker">
          <div className="adm-section-label">重ねる合成用写真</div>
          {overlays.length === 0 ? (
            <p className="adm-empty">「合成素材」タブで合成用写真を登録してください</p>
          ) : (
            <div className="composite-ov-list">
              {overlays.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`composite-ov-thumb${selected?.id === o.id ? " selected" : ""}`}
                  onClick={() => { setSelected(o); setCx(0.5); setCy(0.5); }}
                  title={o.name}
                >
                  <img src={`${BASE}${o.url}`} alt={o.name} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="composite-actions">
          <button className="btn-primary" onClick={save} disabled={saving || !selected}>
            {saving ? "保存中..." : "合成して上書き保存"}
          </button>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>キャンセル</button>
        </div>
      </div>
    </div>
  );
};
