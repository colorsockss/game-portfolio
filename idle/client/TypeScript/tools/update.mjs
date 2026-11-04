// 런타임의 패치 규칙(src/application/update/update.ts: 매니페스트의 이름과 모양, 버킷의 레이아웃, 버전의 모양)을 Node 도구에서
// 쓴다. 그 자리에서 esbuild로 번들해 불러오므로 도구가 같은 규칙을 따로 두지 않는다(tools/data-schema.mjs와 같은 방식).
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("../src/application/update/update.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});
const update = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

export const { MANIFEST, PLATFORM, CHANNELS, channelPath, versionPath, isVersion, parseManifest } = update;
