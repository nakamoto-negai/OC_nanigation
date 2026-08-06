import { useEffect } from "react";
import { api } from "../api/client";

// クリックされた要素からログ用の識別名を決める。
// 優先度: data-log 属性 > aria-label > テキスト > title > ラベルなし。
function labelFor(el: Element): string {
  const explicit = el.getAttribute("data-log");
  if (explicit && explicit.trim()) return explicit.trim();
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 80);
  const title = el.getAttribute("title");
  if (title && title.trim()) return title.trim();
  return "(ラベルなし)";
}

/**
 * アプリ内のあらゆるボタン押下を記録するグローバルロガー。
 * document のキャプチャフェーズで click を拾い、押されたボタン/リンク/role=button を
 * 特定して `button_click` ログを送る（押下要素が stopPropagation してもキャプチャで拾える）。
 * ラベルはボタン文言などから自動判定。個別ボタンに手を入れなくても全押下を記録できる。
 */
export function useButtonLogger() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== "function") return;
      const btn = target.closest(
        "button, a[href], [role='button'], input[type='button'], input[type='submit'], input[type='reset']",
      );
      if (!btn) return;
      api.logs.record({
        action: "button_click",
        label: labelFor(btn),
        screen: window.location.pathname,
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}
