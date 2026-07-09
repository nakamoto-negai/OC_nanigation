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
      let diff = ((raw! - prev) + 540) % 360 - 180;
      const ad = Math.abs(diff);
      // 微小な揺れ(1°未満)はセンサーノイズとみなして無視する（矢印の「ブルブル震え」を止める）。
      // 同じ値を返すと React が再描画をスキップするので無駄な更新も減る。
      if (ad < 1) return prev;
      // 変化が大きいほど速く追従、小さいほどゆっくり平滑化する。
      // 実際に端末を回したとき(大きな差)は即応し、静止時の微小ノイズは強く抑える。
      const alpha = ad > 20 ? 0.5 : 0.12;
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
