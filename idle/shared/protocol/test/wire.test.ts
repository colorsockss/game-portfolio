import { GameErrorCode, Opcode } from "@idle/codes";
import { expect, test } from "vitest";
// 패키지 자신의 index다. 자기 자신을 import하면 shared/protocol에 대한 경계 검사 규칙에 걸린다.
import { PROTOCOL_VERSION, ResultCode, decodeMessage, encodeMessage, socketPath } from "../src/index.js";

// 지금 와이어가 싣는 바이트를 고정한다. 이 스냅숏은 절대 갱신(-u)하지 않는다: 바이트가 바뀌었다면
// 와이어가 바뀐 것이다.
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const player = {
  profile: { loginId: "hero", level: 3, exp: { m: 1.5, e: 3 } },
  currencies: { gold: { m: 7.25, e: 42 } },
  stage: { currentId: 3002, clearedIds: [3001] },
};
const messages = {
  "AuthLogin request": { op: Opcode.AuthLogin, id: "1", body: { loginId: "hero" } },
  "AuthResume request": { op: Opcode.AuthResume, id: "2", body: { token: "t" } },
  "Ping request": { op: Opcode.Ping, id: "3", body: {} },
  "StageSelect request": { op: Opcode.StageSelect, id: "4", body: { stageId: 3002 } },
  "Ok login response": { id: "1", serverTime: 1000, code: ResultCode.Ok, body: { snapshot: { player, revision: 1 }, session: { token: "t", expiresAt: 2000 } } },
  "Ok command response with sync": { id: "4", serverTime: 1000, code: ResultCode.Ok, body: null, sync: { revision: 2, changes: { stage: player.stage } } },
  "Rejected by a rule": { id: "4", serverTime: 1000, code: ResultCode.Rejected, error: { code: GameErrorCode.StageNotFound, message: "x" } },
  "Rejected session": { id: "2", serverTime: 1000, code: ResultCode.Rejected, error: { code: GameErrorCode.SessionExpired, message: "x" } },
  "ServerError response": { id: "4", serverTime: 1000, code: ResultCode.ServerError, message: "x" },
  "BattleSettle request": { op: Opcode.BattleSettle, id: "5", body: {} },
  "BossChallenge request": { op: Opcode.BossChallenge, id: "6", body: {} },
  "Ok settle response with battle sync": {
    id: "5", serverTime: 1000, code: ResultCode.Ok, body: null,
    sync: {
      revision: 3,
      changes: {
        battle: {
          mode: 0,
          at: 1000,
          rng: 123,
          hero: { hp: { m: 2, e: 2 }, cooldowns: [0, 50, 80], effects: [{ effectId: 4008, ticksLeft: 37, amount: { m: 1.5, e: 2 } }] },
          summons: [{ id: 6, summonId: 6001, hp: { m: 1.2, e: 2 }, cooldowns: [3], effects: [], ticksLeft: 180 }],
          waves: 2,
          autoBoss: true,
          nextId: 7,
        },
      },
    },
  },
  // 보유량은 아이템 ID를 키로 하는 맵이다(키는 MessagePack에서 문자열).
  "Ok settle response with items sync": {
    id: "7", serverTime: 1000, code: ResultCode.Ok, body: null,
    sync: { revision: 4, changes: { items: { 1: { m: 7.25, e: 42 }, 2: { m: 1.5, e: 3 } } } },
  },
  "ItemEquip request": { op: Opcode.ItemEquip, id: "8", body: { equipmentId: 3 } },
  "ItemUnequip request": { op: Opcode.ItemUnequip, id: "9", body: { equipmentId: 3 } },
  "ItemEnhance request": { op: Opcode.ItemEnhance, id: "13", body: { equipmentId: 3 } },
  "ItemMerge request": { op: Opcode.ItemMerge, id: "14", body: { equipmentId: 3 } },
  // 장비는 장비 ID를 키로 하는 인스턴스(아이템 ID, 강화 단계) 맵과, 슬롯을 키로 하는 착용이다(키는 MessagePack에서 문자열).
  "Ok command response with equipment sync": {
    id: "8", serverTime: 1000, code: ResultCode.Ok, body: null,
    sync: { revision: 5, changes: { equipment: { nextId: 4, owned: { 1: { itemId: 101, enhance: 0 }, 3: { itemId: 102, enhance: 2 } }, equipped: { 2: 3 } } } },
  },
  // 튜토리얼은 지금 스텝의 ID를 보내고, 진행은 지금 스텝의 ID(마치면 nil) 하나다.
  "TutorialAdvance request": { op: Opcode.TutorialAdvance, id: "12", body: { stepId: 1 } },
  "Ok command response with tutorial sync": {
    id: "12", serverTime: 1000, code: ResultCode.Ok, body: null, sync: { revision: 6, changes: { tutorial: { stepId: 2 } } },
  },
  "Rejected TutorialStepNotCurrent response": {
    id: "12", serverTime: 1000, code: ResultCode.Rejected, error: { code: GameErrorCode.TutorialStepNotCurrent, message: "x" },
  },
  // 강화는 강화 ID를 보내고, 단계는 강화 ID를 키로 하는 맵이다(키는 MessagePack에서 문자열). 낸 골드는 items로 함께 온다.
  "StatUpgrade request": { op: Opcode.StatUpgrade, id: "13", body: { upgradeId: 7001 } },
  "Ok command response with stat upgrade sync": {
    id: "13", serverTime: 1000, code: ResultCode.Ok, body: null,
    sync: { revision: 7, changes: { items: { 1: { m: 9, e: 2 } }, statUpgrades: { 7001: 1, 7003: 12 } } },
  },
  "Rejected NotEnoughGold response": {
    id: "13", serverTime: 1000, code: ResultCode.Rejected, error: { code: GameErrorCode.NotEnoughGold, message: "x" },
  },
  // 스킬(400-499): 장착은 슬롯(0부터)과 스킬, 나머지는 스킬이다. 장착은 슬롯을 키로, 레벨은 배운 스킬 ID를 키로 하는 맵이다(키는
  // MessagePack에서 문자열이고, 배우지 않은 스킬은 담지 않는다).
  "SkillLearn request": { op: Opcode.SkillLearn, id: "15", body: { skillId: 1010 } },
  "SkillEquip request": { op: Opcode.SkillEquip, id: "13", body: { slot: 1, skillId: 1010 } },
  "SkillUnequip request": { op: Opcode.SkillUnequip, id: "16", body: { skillId: 1010 } },
  "SkillLevelUp request": { op: Opcode.SkillLevelUp, id: "14", body: { skillId: 1004 } },
  "Ok command response with skills sync": {
    id: "14", serverTime: 1000, code: ResultCode.Ok, body: null,
    sync: {
      revision: 7,
      changes: { items: { 1: { m: 4, e: 2 } }, skills: { equipped: { 0: 1004, 1: 1010, 2: 1011 }, levels: { 1004: 2, 1005: 1, 1010: 1, 1011: 1 } } },
    },
  },
  "Rejected SkillCostShort response": {
    id: "14", serverTime: 1000, code: ResultCode.Rejected, error: { code: GameErrorCode.SkillCostShort, message: "x" },
  },
  // 환생(600-699)은 본문이 비고, 돌아간 슬라이스(레벨, 보유량, 골드 강화, 스테이지, 새 사냥)와 환생 횟수·포인트가 함께 온다.
  "Rebirth request": { op: Opcode.Rebirth, id: "17", body: {} },
  "Ok command response with rebirth sync": {
    id: "17", serverTime: 1000, code: ResultCode.Ok, body: null,
    sync: {
      revision: 8,
      changes: {
        profile: { loginId: "hero", level: 1 }, items: {}, statUpgrades: {}, stage: { currentId: 3001, clearedIds: [] },
        rebirth: { count: 2, points: 765 },
      },
    },
  },
  "Rejected RebirthNotReady response": {
    id: "17", serverTime: 1000, code: ResultCode.Rejected, error: { code: GameErrorCode.RebirthNotReady, message: "x" },
  },
  // 치트(900-999)도 다른 커맨드와 같은 봉투다. 개발 모드가 아닌 서버는 CheatDisabled(900)로 거절한다.
  "CheatItemGrant request": { op: Opcode.CheatItemGrant, id: "10", body: { itemId: 1, amount: 1000 } },
  "CheatTimeShift request": { op: Opcode.CheatTimeShift, id: "11", body: { duration: 3_600_000 } },
  "Rejected CheatDisabled response": {
    id: "10", serverTime: 1000, code: ResultCode.Rejected,
    error: { code: GameErrorCode.CheatDisabled, message: "Cheats are open only on a development server." },
  },
  // 프로토콜 19부터 게임 커맨드는 예측한 서버 시각(epoch ms, uint64)을 싣고, 너무 잦은 커맨드는 TooManyRequests(4)다.
  "BattleSettle request with its time": { op: Opcode.BattleSettle, id: "18", body: {}, time: 1_792_740_360_526 },
  "TooManyRequests response": { id: "18", serverTime: 1000, code: ResultCode.TooManyRequests, message: "x" },
  // 프로토콜 20부터 커맨드의 답은 보통 결과의 지문(53비트 정수)만 싣는다. 서버가 시각을 잘랐으면 바뀐 슬라이스도 함께 온다. 지문이
  // 예측과 다르면 클라이언트가 StateFetch(4)로 저장 데이터를 받아 온다.
  "Ok command response with a fingerprint": { id: "18", serverTime: 1000, code: ResultCode.Ok, body: null, sync: { revision: 9, fingerprint: 4894465302855801 } },
  "Ok command response with a fingerprint and changes": {
    id: "19", serverTime: 1000, code: ResultCode.Ok, body: null, sync: { revision: 10, fingerprint: 4894465302855801, changes: { stage: player.stage } },
  },
  "StateFetch request": { op: Opcode.StateFetch, id: "20", body: {} },
  "Ok StateFetch response": { id: "20", serverTime: 1000, code: ResultCode.Ok, body: { player, revision: 10 } },
};
test.each(Object.entries(messages))("%s keeps its bytes", (_name, message) => {
  expect(hex(encodeMessage(message))).toMatchSnapshot();
});

// 서버의 소켓은 Uint8Array를, 클라이언트의 소켓은 ArrayBuffer를 넘길 수 있다. 빠진 선택 필드는 nil로 싣지 않는다.
test("messages decode from either byte container, leave out absent fields, and refuse bytes that are not MessagePack", () => {
  const bytes = encodeMessage({ id: "1", serverTime: 1000, code: ResultCode.Ok, body: null, sync: undefined });
  expect(decodeMessage(bytes)).toStrictEqual({ id: "1", serverTime: 1000, code: ResultCode.Ok, body: null });
  expect(decodeMessage(bytes.slice().buffer)).toStrictEqual(decodeMessage(bytes));
  expect(() => decodeMessage(new Uint8Array([0xc1]))).toThrow();
});

test("the socket path carries the protocol version and the rule tables' fingerprint", () => {
  expect(socketPath("0a1b2c3d")).toBe(`/ws?v=${PROTOCOL_VERSION}&d=0a1b2c3d`);
  expect(socketPath("0a1b2c3d", 1)).toBe("/ws?v=1&d=0a1b2c3d");
});
