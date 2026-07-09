// CSVエクスポート用のユーティリティ。

type Cell = string | number | null | undefined;

// 2次元配列から CSV 文字列を生成する。
// 各値はダブルクオートで囲み、内部の " は "" にエスケープする（カンマ・改行を含んでも安全）。
export function toCsv(rows: Cell[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? "" : String(cell);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

// UTF-8 BOM 付きで CSV をダウンロードさせる。
// BOM を付けることで Excel で開いたときに日本語が文字化けしない。
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ファイル名用のタイムスタンプ（YYYYMMDD_HHmm）を返す。
export function csvTimestamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
