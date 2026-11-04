import type { GameData } from "@idle/data-schema";
import type { PlayerState } from "@idle/game-core";
import { testPlayer } from "@idle/game-core/testing";
import type { createTestServer } from "@idle/server/testing";

/**
 * 3002와 3003으로 옮길 수 있게 둘의 선행 스테이지를 클리어한 계정 "hero"를 서버에 미리 만든다. 로그인은 새로
 * 만들지 않고 이 계정을 찾는다. 스테이지 선택을 상태를 바꾸는 커맨드로 쓰는 테스트가 쓴다. `changes`로 레벨, 보유량,
 * 가진 장비, 골드 강화, 스킬을 줄 수 있다(기본 스킬은 새 계정과 같다).
 */
export async function createHero(
  server: Awaited<ReturnType<typeof createTestServer>>, data: GameData,
  changes: Partial<Pick<PlayerState, "hero" | "items" | "equipment" | "statUpgrades" | "skills">> = {},
): Promise<void> {
  const now = Date.now();
  await server.store.createAccount("hero", testPlayer(data, now, { stage: { currentId: 3001, clearedIds: [3001, 3002] }, ...changes }), now);
}
