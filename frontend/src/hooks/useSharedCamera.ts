import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 道案内の間、背面カメラのストリームを1本だけ保持して使い回す共有カメラ。
 *
 * 各ステップカードへスクロールするたびに ARNavGuide が再マウントされ、その都度
 * getUserMedia を呼ぶと、ブラウザ/OS が毎回「カメラへのアクセスが許可されています」
 * を表示してしまう。そこでカメラの取得は一度だけ行い、カードを切り替えても同じ
 * ストリームを各 <video> に付け替えるだけにする。停止は RouteGuide のアンマウント時。
 */
export function useSharedCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");

  const start = useCallback(async () => {
    // すでに取得済み／取得中なら二重に呼ばない（＝再要求しない）
    if (streamRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = s;
      setStream(s);
    } catch (e: any) {
      setError(`カメラを起動できませんでした: ${e?.message ?? e}`);
    } finally {
      startingRef.current = false;
    }
  }, []);

  // 画面（RouteGuide）を離れるときにカメラを停止する。
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return { stream, start, error };
}
