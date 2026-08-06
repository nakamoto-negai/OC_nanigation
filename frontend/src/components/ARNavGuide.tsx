import React, { useEffect, useRef, useState } from "react";
import { RouteStepDetail } from "../types";
import { CompassPermission } from "../hooks/useCompass";
import { gpsBearing, mapBearing, angleDiff } from "../utils/bearing";
import { ArrivalPhotoGallery } from "./ArrivalPhotoGallery";

interface Props {
  step: RouteStepDetail;
  heading: number | null;
  permission: CompassPermission;
  onRequestPermission: () => void;
  userLat: number | null;
  userLng: number | null;
  mapNorthOffset: number;
  onClose: () => void;
  /** カメラ左上ボタンの文言。既定は「画像案内に戻る」。ホーム埋め込み時は「案内をやめる」等に差し替える。 */
  closeLabel?: string;
  /** 「次に進む」: 次のカードへ遷移する。 */
  onNext: () => void;
  /** 位置情報で次のチェックポイントに到達したか。true の間カメラに「到着しました」を表示する。 */
  arrived?: boolean;
  /** 目的ノードまでの距離(m)。GPS が無ければ null。近づくと「到着まで◯m」を表示する。 */
  distance?: number | null;
  /** 「到着地点を確認する」ボタンが押されたとき（ログ記録などに使う）。 */
  onConfirmArrival?: () => void;
  /** デモ用: 指定するとカメラを起動せず、この画像を背景（カメラの代わり）に表示する。
      道案内ARと全く同じレイアウトで、カメラ部分だけを画像に差し替えるために使う。 */
  demoImageUrl?: string;
  /** 親（RouteGuide）が保持する共有カメラのストリーム。指定された場合、このコンポーネントは
      getUserMedia を呼ばず、このストリームを <video> に付けるだけにする（カード切替のたびに
      カメラを再要求しないため）。undefined の場合は従来どおり自前でカメラを取得する。 */
  externalStream?: MediaStream | null;
  /** externalStream モードでのカメラ取得エラー文言（親から渡す）。 */
  externalError?: string;
}

// 目的ノードまでこの距離(m)以内に近づいたら「到着まで◯m」のカウントダウンを表示する
const APPROACH_DISPLAY_M = 10;

/**
 * 純コンパス AR 道案内（360 画像を使わない方式）。
 *
 * 背面カメラのライブ映像の上に、次ノードへの進行方向を示す矢印を重ねる。
 * 目標方位の計算は CompassGuide と同一（GPS 優先・無ければマップ座標 + map_north_offset）。
 * 端末コンパス(heading)との差 angleDiff だけ矢印を回すので、
 *   差 0  → 矢印は真上（このまま進む）
 *   差 +  → 右に傾く（右へ回る）
 *   差 -  → 左に傾く（左へ回る）
 */
export const ARNavGuide: React.FC<Props> = ({
  step, heading, permission, onRequestPermission, userLat, userLng, mapNorthOffset, onClose, closeLabel = "画像案内に変更", onNext, arrived = false, distance = null, onConfirmArrival, demoImageUrl, externalStream, externalError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [err, setErr] = useState("");
  // 親から共有ストリームを渡された場合は「共有モード」。自前でカメラ取得・停止をしない。
  const externalMode = externalStream !== undefined;
  // 表示するカメラエラー（共有モードは親のエラー、スタンドアロンは自前のエラー）。
  const displayErr = externalMode ? (externalError ?? "") : err;
  // 「到着地点を確認する」で、到着地点(終着ノード)の登録写真をオーバーレイ表示するか
  const [showArrival, setShowArrival] = useState(false);
  const arrivalScrollRef = useRef<HTMLDivElement>(null);
  // onNext は毎レンダリング新しい関数になるので ref に退避する。これを使うことで、
  // 下のスクロール監視 useEffect の依存を showArrival だけにでき、AR中にコンパス heading の
  // 更新で ARNavGuide が高頻度に再レンダリングされてもリスナーと積算値(accum)が張り替わらない。
  // （以前はここに onNext を依存に入れていたため、指ドラッグ中に効果が作り直されて accum が
  //   毎フレーム 0 に戻り、しきい値に届かず「次カードへ送り」が発火しなかった。）
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);

  // 到着地点オーバーレイのスクロールが最下部に達した後、さらに下へスクロールしたら
  // 「カードのスクロール」として扱い、次のカードへ送る（到着写真を読み終えてそのまま次へ進める）。
  useEffect(() => {
    if (!showArrival) return;
    const el = arrivalScrollRef.current;
    if (!el) return;

    const EPS = 2;
    const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - EPS;
    const THRESHOLD = 48; // 最下部到達後、この量を超えて続けて下スクロールしたら次カードへ
    let accum = 0;
    let fired = false;
    const advance = () => {
      if (fired) return;
      fired = true;
      onNextRef.current();      // 次のカードへスナップ移動（RouteGuide 側の goToNextCard）
      setShowArrival(false);    // この到着オーバーレイは閉じて、次カードへ移る
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0 && atBottom()) {
        e.preventDefault();
        accum += e.deltaY;
        if (accum > THRESHOLD) advance();
      } else if (e.deltaY < 0) {
        accum = 0;
      }
    };
    let lastY: number | null = null;
    const onTouchStart = (e: TouchEvent) => { lastY = e.touches[0].clientY; accum = 0; fired = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (lastY == null) lastY = e.touches[0].clientY;
      const y = e.touches[0].clientY;
      const dy = lastY - y; // >0: 指を上へ動かす＝下方向スクロール（次カードへ）
      lastY = y;
      if (dy > 0 && atBottom()) {
        e.preventDefault(); // 内側のラバーバンドを止めてカード送りに使う
        accum += dy;
        if (accum > THRESHOLD) advance();
      } else if (dy < 0) {
        accum = 0; // 上方向に戻したら積算をリセット
      }
    };
    const onTouchEnd = () => { accum = 0; fired = false; lastY = null; };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [showArrival]);

  // 目標方位（CompassGuide と同じロジック）
  const { targetBearing, method } = (() => {
    const from = step.from_node;
    const to = step.to_node;
    if (userLat != null && userLng != null && to.lat != null && to.lng != null) {
      return { targetBearing: gpsBearing(userLat, userLng, to.lat, to.lng), method: "GPS" };
    }
    return {
      targetBearing: mapBearing(from.x, from.y, to.x, to.y, mapNorthOffset),
      method: "マップ",
    };
  })();

  // 共有モード: 親（RouteGuide）が保持するストリームを <video> に付けるだけ。
  // getUserMedia は呼ばない＝カード切替のたびの再要求（許可トースト）が起きない。
  // アンマウントでもストリームは止めない（親が管理する）。
  useEffect(() => {
    if (demoImageUrl || !externalMode) return;
    const v = videoRef.current;
    if (v && externalStream) {
      v.srcObject = externalStream;
      v.play().catch(() => { /* 自動再生の失敗は無視 */ });
      setCameraOn(true);
    }
  }, [demoImageUrl, externalMode, externalStream]);

  // スタンドアロンモード（externalStream 未指定）: 自前で背面カメラを取得し、アンマウントで停止する。
  // デモモード（demoImageUrl 指定）ではカメラを使わないので起動しない。
  useEffect(() => {
    if (demoImageUrl || externalMode) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraOn(true);
      } catch (e: any) {
        if (!cancelled) setErr(`カメラを起動できませんでした: ${e?.message ?? e}`);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [demoImageUrl, externalMode]);

  const hasHeading = heading !== null && permission === "granted";
  const diff = hasHeading ? angleDiff(targetBearing, heading!) : 0;
  const absD = Math.abs(diff);

  // 矢印は React の再描画を経由せず、requestAnimationFrame で SVG の transform を
  // 直接書き換える（受信→描画の経路を最短化）。目標角(diff)へ毎フレーム最短方向に
  // 少しずつ寄せるので、センサーのノイズやイベント間隔に左右されず滑らかに動く。
  const arrowRef = useRef<SVGSVGElement>(null);
  const targetDiffRef = useRef(0); // 目標角（最新の diff）
  const dispDiffRef = useRef(0);   // 現在表示している角（連続値）
  useEffect(() => { targetDiffRef.current = diff; }, [diff]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // 表示角 → 目標角 への最短差分 [-180,180]（真後ろでの反転もこれで最短方向に回る）
      const delta = ((targetDiffRef.current - dispDiffRef.current + 540) % 360) - 180;
      // 残差が十分小さければスナップして無駄な微小更新を止める
      dispDiffRef.current += Math.abs(delta) < 0.1 ? delta : delta * 0.25;
      if (arrowRef.current) {
        arrowRef.current.style.transform = `rotate(${dispDiffRef.current}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const status: "ok" | "warn" | "ng" = absD <= 20 ? "ok" : absD <= 60 ? "warn" : "ng";
  const label = !hasHeading
    ? "コンパス未取得"
    : absD <= 20
    ? "この方向へ進む ✓"
    : diff < 0
    ? `左へ ${Math.round(absD)}°`
    : `右へ ${Math.round(absD)}°`;

  return (
    <div className="arnav">
      {/* touch-action: pan-y で、カメラ上を縦スワイプしたとき道案内が普通にスクロールできるようにする */}
      <div className="arnav-camera-wrap" style={{ touchAction: "pan-y" }}>
        {demoImageUrl ? (
          <img className="arnav-video" src={demoImageUrl} alt="" draggable={false} />
        ) : (
          <video ref={videoRef} className="arnav-video" playsInline muted />
        )}

        {/* カメラ上部の操作バー: 画像案内へ戻る / 到着地点を確認する */}
        <div className="arnav-topbar">
          <button className="arnav-top-btn arnav-top-switch" onClick={onClose}>{closeLabel}</button>
          <button
            className="arnav-top-btn arnav-top-confirm"
            onClick={() => { setShowArrival(true); onConfirmArrival?.(); }}
          >
            到着地点を確認する
          </button>
        </div>

        {/* 位置情報で到着したらカメラ全面に「到着しました」を表示 */}
        {arrived && (
          <div className="arnav-arrived">
            <span className="arnav-arrived-check">✓</span>
            <span className="arnav-arrived-text">到着しました</span>
            <span className="arnav-arrived-sub">{step.to_node.name}</span>
          </div>
        )}

        {/* 到着直前（APPROACH_DISPLAY_M 以内）は残り距離を表示する */}
        {!arrived && distance != null && distance <= APPROACH_DISPLAY_M && (
          <div className="arnav-distance">
            到着まで 約{Math.max(1, Math.ceil(distance))}m
          </div>
        )}

        <div className="arnav-overlay">
          {hasHeading ? (
            <>
              <svg
                ref={arrowRef}
                className={`arnav-arrow arnav-${status}`}
                viewBox="0 0 100 100"
              >
                <polygon points="50,8 80,72 50,56 20,72" />
              </svg>
              <div className={`arnav-label arnav-${status}-text`}>{label}</div>
            </>
          ) : permission === "unsupported" ? (
            <div className="arnav-need-compass"><span>コンパス非対応の端末です</span></div>
          ) : (
            // コンパス未取得時: 灰色のコンパス（静的）と、被らない位置（下）に許可ボタンを出す。
            <>
              <svg className="arnav-arrow arnav-idle" viewBox="0 0 100 100" role="img" aria-label="コンパス未取得">
                <polygon points="50,8 80,72 50,56 20,72" />
              </svg>
              <button className="cg-enable-btn arnav-enable-btn" onClick={onRequestPermission}>
                コンパスを有効にする
              </button>
            </>
          )}
        </div>

        {/* ボタンを押したら、到着地点の登録写真をオーバーレイ表示する */}
        {showArrival && (
          <div className="arnav-arrival-view">
            <div className="arnav-arrival-head">
              <span className="arnav-arrival-name">{step.to_node.name}</span>
              <button
                className="arnav-arrival-close"
                onClick={() => setShowArrival(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="arnav-arrival-scroll" ref={arrivalScrollRef}>
              <ArrivalPhotoGallery
                linkId={step.link.id}
                initialPhotos={step.link.arrival_photos}
                emptyText="このリンクの到着地点写真はまだ登録されていません"
              />
              {/* 最下部の案内。ここでさらに下へスクロールすると次のカードへ進む。 */}
              <div className="arnav-arrival-more">↓ さらに下にスクロールで次のカードへ</div>
            </div>
          </div>
        )}

        {!demoImageUrl && !cameraOn && !displayErr && <div className="arnav-placeholder">カメラ起動中…</div>}
        {displayErr && <div className="arnav-error">{displayErr}</div>}
        <div className="arnav-method">{method}基準</div>

        {/* カメラ道案内中は常に、利用ログの研究利用に関する注記を表示する */}
        <div className="arnav-research-note">
          アプリの利用ログは個人が分からない形で研究に利用される場合があります。
        </div>
      </div>
    </div>
  );
};
