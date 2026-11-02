// 앱의 C# API 지문. Unity(TypeScriptTypings)가 C#이 바뀔 때 types/csharp.d.ts의 둘째 줄에 다시 적는다. 릴리스 빌드가
// 번들의 RUNTIME_API와 매니페스트의 api로 넣고(tools/build.mjs), 내보내기가 올린 버전이 이 API의 것인지 본다(tools/patch.mjs).
import { readFile } from "node:fs/promises";
import path from "node:path";

/** `clientRoot`(client/TypeScript/)의 csharp.d.ts에서 16자리 16진수 지문을 읽는다. 없으면 throw한다. */
export async function readApi(clientRoot) {
  const typings = await readFile(path.join(clientRoot, "types", "csharp.d.ts"), "utf8");
  const api = /^\/\/ API 지문: ([0-9a-f]{16})$/m.exec(typings)?.[1];
  if (api === undefined) throw new Error("No API fingerprint in types/csharp.d.ts; open the Unity project to generate it.");
  return api;
}
