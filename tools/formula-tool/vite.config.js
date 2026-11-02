import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit()],

  // Tauri 개발용 Vite 설정으로, `tauri dev`와 `tauri build`에서만 쓰인다.
  //
  // 1. Vite가 Rust 오류를 화면에서 지우지 않게 한다.
  clearScreen: false,
  // 2. Tauri는 고정 포트를 기대하므로, 그 포트를 쓸 수 없으면 실패한다.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Vite가 `src-tauri`를 감시하지 않게 한다.
      ignored: ["**/src-tauri/**"],
    },
  },
}));
