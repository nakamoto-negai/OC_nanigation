import { useEffect, useState } from "react";

export type CameraPermission = "prompt" | "granted" | "denied" | "unsupported";

// ── モジュール単位のシングルトン ─────────────────────────────────
// カメラ許可の状態を1か所で保持し、購読者へ通知する。方位センサー(useCompass)と
// 同じ設計。iOS Safari は Permissions API でカメラ状態を照会できないため、
// 実際に getUserMedia を呼ぶまで "prompt" のまま（起動時ポップアップの対象になる）。
let permissionState: CameraPermission = "prompt";
let inited = false;

const subs = new Set<(p: CameraPermission) => void>();

function emit(p: CameraPermission) {
  permissionState = p;
  subs.forEach((cb) => cb(p));
}

function ensureInit() {
  if (inited) return;
  inited = true;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    emit("unsupported");
    return;
  }
  // Chrome/Android は Permissions API でカメラ状態を先読みできる（iOS は非対応→prompt のまま）。
  const perms = (navigator as any).permissions;
  if (perms?.query) {
    perms
      .query({ name: "camera" })
      .then((res: any) => {
        const apply = () => {
          if (res.state === "granted") emit("granted");
          else if (res.state === "denied") emit("denied");
        };
        apply();
        res.onchange = apply;
      })
      .catch(() => {
        /* 未対応（iOS 等）は prompt のまま */
      });
  }
}

// ユーザー操作内で呼ぶ。許可だけ取ってトラックは即停止する（後段の実利用時に再取得しても再プロンプトは出ない）。
export function requestCameraPermission() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    emit("unsupported");
    return;
  }
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "environment" }, audio: false })
    .then((stream) => {
      stream.getTracks().forEach((t) => t.stop());
      emit("granted");
    })
    .catch(() => emit("denied"));
}

// カメラ許可状態を購読するフック。
export function useCameraPermission() {
  const [state, setState] = useState<CameraPermission>(permissionState);
  useEffect(() => {
    ensureInit();
    setState(permissionState);
    subs.add(setState);
    return () => {
      subs.delete(setState);
    };
  }, []);
  return { state, request: requestCameraPermission };
}
