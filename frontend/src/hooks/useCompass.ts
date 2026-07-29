import { useState, useEffect } from "react";

export type CompassPermission = "prompt" | "granted" | "denied" | "unsupported";

// ── モジュール単位のシングルトン ─────────────────────────────────
// 方位センサーのリスナーは（何個フックを呼んでも）一度だけ張り、最新 heading と
// permission を購読者へ通知する。heading を購読しないコンポーネント（＝許可だけ
// 使う画面）は、60fps で届く heading 更新では再レンダリングされない。
// これにより、目的地選択画面など heading 不要の画面がセンサー更新でカクついて
// タップを取りこぼす問題を防ぐ。
let permissionState: CompassPermission = "prompt";
let latestHeading: number | null = null;
let listening = false;
// 一度でも「絶対方位（北基準）」のイベントを受け取ったか。
// Android は deviceorientationabsolute（絶対）と deviceorientation（相対）の両方が
// 発火することがあり、相対 alpha は北と無関係。絶対方位を得た後は相対を無視する。
let gotAbsolute = false;
// iOS で最初の画面タッチ時に許可要求を一度だけ自動発火させたか
let autoRequested = false;
// 自動許可要求を許可してよいか。お知らせ(POP)を先に見せたいので、既定は false。
// POP を閉じた後（POP が無ければ即）に armCompassAutoRequest() で true にする。
let autoRequestArmed = false;
let inited = false;

// お知らせPOPの後にコンパス許可要求を解禁する。UserApp から呼ぶ。
export function armCompassAutoRequest() {
  autoRequestArmed = true;
}

const permSubs = new Set<(p: CompassPermission) => void>();
const headSubs = new Set<(h: number | null) => void>();

function emitPermission(p: CompassPermission) {
  permissionState = p;
  permSubs.forEach((cb) => cb(p));
}
function emitHeading(h: number | null) {
  latestHeading = h;
  headSubs.forEach((cb) => cb(h));
}

function applyRaw(raw: number) {
  if (latestHeading === null) { emitHeading(raw); return; }
  // 直前値からの最短差分 [-180,180]
  const diff = ((raw - latestHeading) + 540) % 360 - 180;
  const ad = Math.abs(diff);
  // 追従度(alpha)を差の大きさに応じて連続的に変える（ハードなデッドゾーンは作らない）。
  //   静止時の微小ノイズ → alpha が小さくほぼ動かない（震えを抑える）
  //   実際に回した大きな差 → alpha が大きく素早く追従する
  const alpha = Math.min(0.5, Math.max(0.08, ad / 60));
  emitHeading((latestHeading + diff * alpha + 360) % 360);
}

function handleOrientation(e: DeviceOrientationEvent) {
  const ios = (e as any).webkitCompassHeading as number | null;
  let raw: number | null = null;
  if (ios != null && ios >= 0) {
    // iOS: webkitCompassHeading はすでに真北基準
    gotAbsolute = true;
    raw = ios;
  } else if (e.alpha != null) {
    const isAbsolute = e.absolute === true || e.type === "deviceorientationabsolute";
    if (isAbsolute) gotAbsolute = true;
    else if (gotAbsolute) return; // 絶対方位を得た後の相対イベントは無視
    raw = (360 - e.alpha + 360) % 360;
  }
  if (raw == null) return;
  applyRaw(raw);
}

function startListening() {
  if (!listening) {
    listening = true;
    window.addEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
  }
  emitPermission("granted");
}

// iOS ではユーザー操作内で呼ぶ必要がある。Android/PC は許可不要でそのまま開始。
export function requestCompassPermission() {
  const req = (DeviceOrientationEvent as any)?.requestPermission;
  if (typeof req !== "function") { startListening(); return; }
  Promise.resolve(req.call(DeviceOrientationEvent))
    .then((result: string) => {
      if (result === "granted") startListening();
      else emitPermission("denied");
    })
    .catch(() => emitPermission("denied"));
}

function ensureInit() {
  if (inited) return;
  inited = true;
  if (typeof window === "undefined" || !window.DeviceOrientationEvent) {
    emitPermission("unsupported");
    return;
  }
  const needsPermission =
    typeof (DeviceOrientationEvent as any).requestPermission === "function";
  if (!needsPermission) { startListening(); return; } // Android/PC は即開始

  // カメラ（getUserMedia）と同様に、読み込み後できるだけ早く許可を求める。
  // iOS Safari は requestPermission をユーザー操作内でしか呼べないため、
  // マウント後の「最初の画面タッチ」で一度だけ自動的に許可要求を発火させる。
  const remove = () => {
    window.removeEventListener("touchend", onGesture);
    window.removeEventListener("click", onGesture);
  };
  const onGesture = () => {
    // お知らせPOPを閉じるまで（未 arm の間）は許可要求しない
    if (!autoRequestArmed) return;
    if (autoRequested) return;
    autoRequested = true;
    remove();
    requestCompassPermission();
  };
  window.addEventListener("touchend", onGesture);
  window.addEventListener("click", onGesture);
}

// ── フック ───────────────────────────────────────────────────────
// 許可状態だけを購読する（heading 更新では再レンダリングしない）。
// 目的地選択画面など、方位を表示しないが許可導線だけ出したい画面で使う。
export function useCompassPermission() {
  const [permission, setPermission] = useState<CompassPermission>(permissionState);
  useEffect(() => {
    ensureInit();
    setPermission(permissionState);
    permSubs.add(setPermission);
    return () => { permSubs.delete(setPermission); };
  }, []);
  return { permission, requestPermission: requestCompassPermission };
}

// heading と許可の両方を購読する（方位を表示・利用する画面用）。
export function useCompass() {
  const { permission, requestPermission } = useCompassPermission();
  const [heading, setHeading] = useState<number | null>(latestHeading);
  useEffect(() => {
    setHeading(latestHeading);
    headSubs.add(setHeading);
    return () => { headSubs.delete(setHeading); };
  }, []);
  return { heading, permission, requestPermission };
}
