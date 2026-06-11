// カメラ映像オーバーレイへの描画ヘルパー（特徴点・認識枠）。

import { Keypoint } from "./opencv";

// 検出した特徴点を canvas にオーバーレイ描画する
export function drawKeypoints(
  ctx: CanvasRenderingContext2D,
  keypoints: Keypoint[],
  scaleX: number,
  scaleY: number,
) {
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
  for (const kp of keypoints) {
    const r = Math.max(3, (kp.size / 2) * Math.min(scaleX, scaleY));
    const x = kp.x * scaleX;
    const y = kp.y * scaleY;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // 向き（angle）を線で表示
    if (kp.angle >= 0) {
      const rad = (kp.angle * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(rad) * r, y + Math.sin(rad) * r);
      ctx.stroke();
    }
  }
}

// 認識した対象の四隅（フレーム座標）をオーバーレイに枠＋ラベルで描画
export function drawQuad(
  ctx: CanvasRenderingContext2D,
  quad: { x: number; y: number }[],
  scaleX: number,
  scaleY: number,
  label: string,
) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(59, 130, 246, 0.95)";
  ctx.beginPath();
  quad.forEach((p, i) => {
    const x = p.x * scaleX;
    const y = p.y * scaleY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  const lx = quad[0].x * scaleX;
  const ly = quad[0].y * scaleY;
  ctx.font = "bold 22px sans-serif";
  const w = ctx.measureText(label).width + 16;
  ctx.fillStyle = "rgba(59, 130, 246, 0.95)";
  ctx.fillRect(lx, Math.max(0, ly - 30), w, 28);
  ctx.fillStyle = "white";
  ctx.fillText(label, lx + 8, Math.max(20, ly - 10));
}
