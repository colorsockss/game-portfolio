import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// IL2CPP는 C#에서 부르지 않는 엔진 멤버를 잘라낸다. TS가 리플렉션으로 직접 부르는 엔진 타입(components.ts의 UnityTypes)은
// PuerTS 설정의 [Binding] 목록(Assets/Editor/TypeScript/TypeScriptTypings.cs)이 만든 link.xml에 있어야 기기에서 돈다.
const components = fileURLToPath(new URL("../src/unity/binding/components.ts", import.meta.url));
const linkXml = fileURLToPath(new URL("../../Assets/Gen/link.xml", import.meta.url));

test("every engine type the TS binds to is preserved in the generated link.xml", async () => {
  const source = await readFile(components, "utf8");
  const registry = source.slice(source.indexOf("export interface UnityTypes {"));
  const bound = [...registry.slice(0, registry.indexOf("\n}")).matchAll(/"([\w.]+)":/g)].map(match => match[1]);
  const engine = bound.filter(type => !type.startsWith("PortfolioIdleRpg."));
  expect(engine.length).toBeGreaterThan(0);

  const preserved = new Set([...(await readFile(linkXml, "utf8")).matchAll(/<type fullname="([^"]+)"/g)].map(match => match[1]));
  // 버튼과 입력의 이벤트(AddListener, RemoveListener)도 엔진 타입이다(2026-11-02 기기에서 RemoveListener가 잘림).
  const missing = [...engine, "UnityEngine.Events.UnityEvent", "UnityEngine.Events.UnityEvent`1"].filter(type => !preserved.has(type));
  expect(missing).toEqual([]);
});
