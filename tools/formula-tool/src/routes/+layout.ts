// Tauri에는 SSR을 제대로 처리할 Node.js 서버가 없다.
// 그래서 adapter-static을 쓰고 index.html로 폴백해 사이트를 SPA 모드로 만든다.
// 참고: https://svelte.dev/docs/kit/single-page-apps
// 자세한 내용: https://v2.tauri.app/start/frontend/sveltekit/
export const ssr = false;
