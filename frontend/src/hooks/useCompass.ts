import { useState, useEffect, useCallback, useRef } from "react";

export type CompassPermission = "prompt" | "granted" | "denied" | "unsupported";

export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [permission, setPermission] = useState<CompassPermission>("prompt");
  // 一度でも「絶対方位（北基準）」のイベントを受け取ったか。
  // Android は deviceorientationabsolute（絶対）と deviceorientation（相対）の
  // 両方が発火することがあり、相対 alpha は北と無関係なので混ざるとコンパスが狂う。
  // 絶対方位を得た後は相対イベントを無視して、北基準の値だけを使う。
  const gotAbsoluteRef = useRef(false);

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    const ios = (e as any).webkitCompassHeading as number | null;
    let raw: number | null = null;
    if (ios != null && ios >= 0) {
      // iOS: webkitCompassHeading はすでに真北基準
      gotAbsoluteRef.current = true;
      raw = ios;
    } else if (e.alpha != null) {
      const isAbsolute = e.absolute === true || e.type === "deviceorientationabsolute";
      if (isAbsolute) {
        gotAbsoluteRef.current = true;
      } else if (gotAbsoluteRef.current) {
        // 絶対方位を得た後に届いた相対イベントは無視する
        return;
      }
      raw = (360 - e.alpha + 360) % 360;
    }
    if (raw == null) return;
    setHeading((prev) => {
      if (prev === null) return raw!;
      // prev からの最短差分 [-180,180]
      const diff = ((raw! - prev) + 540) % 360 - 180;
      const ad = Math.abs(diff);
      // 追従度(alpha)を差の大きさに応じて連続的に変える（ハードなデッドゾーンは作らない）。
      //   静止時の微小ノイズ → alpha が小さく、ほとんど動かない（震えを抑える）
      //   実際に端末を回した大きな差 → alpha が大きく、素早く追従する
      // 段差なく変化するので「固まって急に動く」カクつきが起きない。
      const alpha = Math.min(0.5, Math.max(0.08, ad / 60));
      return (prev + diff * alpha + 360) % 360;
    });
  }, []);

  const startListening = useCallback(() => {
    window.addEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    setPermission("granted");
  }, [handleOrientation]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.DeviceOrientationEvent) {
      setPermission("unsupported");
      return;
    }
    const needsPermission =
      typeof (DeviceOrientationEvent as any).requestPermission === "function";
    if (!needsPermission) {
      startListening();
    }
    return () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation as EventListener, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [startListening, handleOrientation]);

  const requestPermission = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission !== "function") {
      startListening();
      return;
    }
    try {
      const result = await (DeviceOrientationEvent as any).requestPermission();
      if (result === "granted") {
        startListening();
      } else {
        setPermission("denied");
      }
    } catch {
      setPermission("denied");
    }
  }, [startListening]);

  return { heading, permission, requestPermission };
}
