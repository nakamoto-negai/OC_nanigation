import React, { useCallback, useEffect, useRef, useState } from "react";
import { OverlayImage } from "../types";
import { api } from "../api/client";

const BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  /** 合成のベースになる既存画像のURL（/uploads/... など） */
  baseImageUrl: string;
  /** モーダル見出し（例:「到着写真に合成」） */
  title?: string;
  onClose: () => void;
  /** 合成して平坦化した画像（JPEG Blob）を保存する。保存先は呼び出し側が決める。 */
  onSave: (blob: Blob) => Promise<void>;
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
 * 既存画像に「合成用写真」を重ねて1枚に合成し、保存するエディタ（管理者のみ）。
 * 合成用写真は事前に「合成素材」タブで登録しておき、ここで選んで移動・拡大縮小できる。
 * 保存するとキャンバスで平坦化し、onSave に JPEG Blob を渡す（上書きは呼び出し側で行う）。
 */
export const CompositeEditor: React.FC<Props> = ({ baseImageUrl, title = "画像に合成", onClose, onSave }) => {
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

  // ドラッグ中の移動は window で拾う。setPointerCapture はブラウザによっては例外を投げたり
  // 途中でキャプチャが外れたりして「動かない」原因になりやすいため使わない。
  // window リスナーなら、ポインタが画像の外に出ても確実に追従できる。
  const onWindowMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    const stage = stageRef.current;
    if (!d || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setCx(clamp(d.cx + (e.clientX - d.px) / rect.width, 0, 1));
    setCy(clamp(d.cy + (e.clientY - d.py) / rect.height, 0, 1));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onWindowMove]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!selected) return;
    e.preventDefault();
    dragRef.current = { px: e.clientX, py: e.clientY, cx, cy };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

  // アンマウント時にドラッグ監視を確実に解除する
  useEffect(() => () => endDrag(), [endDrag]);

  const save = useCallback(async () => {
    if (!selected) { setMsg("重ねる合成用写真を選んでください"); return; }
    setSaving(true);
    setMsg(null);
    try {
      const [baseImg, ovImg] = await Promise.all([
        loadImage(`${BASE}${baseImageUrl}`),
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

      await onSave(blob);
      onClose();
    } catch (e: any) {
      setMsg(e?.message ?? "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [selected, scale, cx, cy, baseImageUrl, onSave, onClose]);

  return (
    <div className="composite-overlay" onClick={onClose}>
      <div className="composite-modal" onClick={(e) => e.stopPropagation()}>
        <div className="composite-head">
          <h3>{title}</h3>
          <button className="dest-modal-close" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        {msg && <div className="adm-msg err" onClick={() => setMsg(null)}>{msg} ✕</div>}

        {/* プレビュー（ベース画像＋重ねる写真）。重ねる写真はドラッグで移動できる。 */}
        <div className="composite-stage" ref={stageRef}>
          <img className="composite-base" src={`${BASE}${baseImageUrl}`} alt="" draggable={false} />
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
