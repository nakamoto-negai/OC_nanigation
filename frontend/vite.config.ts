import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 本番ビルドでもソースマップを出力し、圧縮スタックでも元のコード位置が分かるようにする
  build: { sourcemap: true },
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": { target: "http://backend:8080", changeOrigin: true },
      "/uploads": { target: "http://backend:8080", changeOrigin: true },
    },
  },
});
