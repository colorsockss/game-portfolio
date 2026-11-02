// Tauri에는 SSR을 할 Node.js 서버가 없으므로, index.html로 돌아가는 adapter-static으로
// 사이트를 SPA 모드로 띄운다.
// 참고: https://svelte.dev/docs/kit/single-page-apps
// 참고: https://v2.tauri.app/start/frontend/sveltekit/
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
  },
};

export default config;
