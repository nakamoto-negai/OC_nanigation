// カメラ許可の先取り取得。
// getUserMedia を呼ぶと必ずブラウザ標準の許可ダイアログが出る（サイト側で消せない）。
// これをユーザー操作（「現在地を特定しました」の「次へ」タップ）を起点に一度だけ呼び、
// 許可を取ったらトラックは即停止する。以降 AR 等でカメラを使う際は再プロンプトが出ない。
// iOS は getUserMedia をユーザー操作内で呼ぶ必要があるため、必ずタップ直後（同期）に呼ぶこと。
let requested = false;

export function requestCameraPermission(): void {
  if (requested) return;
  requested = true;
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return;
  md.getUserMedia({ video: { facingMode: "environment" }, audio: false })
    .then((stream) => {
      // 許可だけ取れれば良いのでトラックは止める（カメラは点けっぱなしにしない）
      stream.getTracks().forEach((t) => t.stop());
    })
    .catch(() => {
      // 拒否や失敗はブラウザが状態を記憶するため、ここでは何もしない
    });
}
