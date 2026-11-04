// 결정성 골든 벡터: 정한 시드와 입력의 이벤트와 상태를 파일에 적어 두고, 시뮬레이션이 바뀌면 같은 입력이 다른 결과를
// 내는지 본다. 규칙이나 데이터를 일부러 바꿨으면 `npx vitest run -u`로 다시 쓰고 diff를 확인한다. 같은 파일을
// 클라이언트와 서버가 같은 코드로 내므로(integration이 확인), 여기서 고정하면 두 쪽이 함께 고정된다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadGameData } from "@idle/data-schema";
import { expect, test } from "vitest";
import { MAX_SETTLE_TICKS } from "../src/battle/constants.js";
import { freshBattle } from "../src/battle/settle.js";
import { startBattle, type BattleEvent } from "../src/battle/simulation.js";
import { testPlayer } from "../src/testing.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const AT = 1_000_000;

// 새 계정의 사냥(3001, 1레벨, 레벨업 있음). 10분 안에 클리어, 레벨업, 쓰러짐과 부활, 범위 공격, 효과(화상, 독, 기절),
// 발사체(착탄과 사라짐), 소환수(소환과 만료)가 모두 나온다.
function start() {
  const player = testPlayer(data, AT, { profile: { loginId: "golden" }, hero: { level: 1 } });
  return startBattle({ player: { ...player, battle: freshBattle(player, data, AT, 777) }, data });
}

const line = (event: BattleEvent) => JSON.stringify(event);

test("the first minute yields the recorded events", async () => {
  const events: string[] = [];
  start().advance(600, event => events.push(line(event)));
  await expect(events.join("\n") + "\n").toMatchFileSnapshot("golden/battle-3001-first-minute.jsonl");
});

test("ten minutes yield the recorded digest, last boundary and state", async () => {
  const battle = start();
  const hash = createHash("sha256");
  const counts: Record<string, number> = {};
  battle.advance(MAX_SETTLE_TICKS, event => {
    hash.update(line(event) + "\n");
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  });
  for (const type of [
    "spawn", "attack", "death", "retreat", "revive", "stageClear", "levelUp", "effectApply", "effectTick", "effectEnd", "launch", "impact", "vanish",
    "summon", "expire",
  ]) {
    expect(counts[type]).toBeGreaterThan(0);
  }
  const golden = {
    events: hash.digest("hex"),
    counts,
    lastBoundary: battle.lastBoundary(),
    signature: battle.signature(),
  };
  await expect(JSON.stringify(golden, null, 2) + "\n").toMatchFileSnapshot("golden/battle-3001-ten-minutes.json");
});

// 12레벨 영웅의 3004(사냥 웨이브 하나 뒤 보스 오우거 족장). 족장의 함성(공격력 강화, 보호막, 정화)과 대지 강타(기절)가
// 나오고 보호막이 깨진다.
test("a boss fight yields the recorded digest and state", async () => {
  const player = testPlayer(data, AT, { profile: { loginId: "golden" }, hero: { level: 12 }, stage: { currentId: 3004, clearedIds: [3001, 3002, 3003] } });
  const battle = startBattle({ player: { ...player, battle: { ...freshBattle(player, data, AT, 777), waves: 3 } }, data });
  const hash = createHash("sha256");
  const effects: Record<string, number> = {};
  battle.advance(MAX_SETTLE_TICKS, event => {
    hash.update(line(event) + "\n");
    if (event.type === "effectApply" || event.type === "effectEnd") {
      const key = `${event.type} ${event.effectId}${event.type === "effectEnd" ? ` ${event.reason}` : ""}`;
      effects[key] = (effects[key] ?? 0) + 1;
    }
  });
  for (const effectId of [4003, 4005, 4008, 4009]) expect(effects[`effectApply ${effectId}`]).toBeGreaterThan(0);
  const golden = { events: hash.digest("hex"), effects, lastBoundary: battle.lastBoundary(), signature: battle.signature() };
  await expect(JSON.stringify(golden, null, 2) + "\n").toMatchFileSnapshot("golden/battle-3004-boss.json");
});
