import { GameErrorCode, Opcode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import { expect, test } from "vitest";
import { LOGIN_ID_LENGTH, isValidLoginId } from "../src/account.js";
import type { Command } from "../src/command.js";
import { applyCommand, isCommandOpcode } from "../src/commands/index.js";
import type { PlayerState } from "../src/state.js";

test("a login ID is 4 to 16 lowercase letters, digits or underscores", () => {
  expect(LOGIN_ID_LENGTH).toEqual({ min: 4, max: 16 });
  for (const id of ["abcd", "hero_0123456789x", "____", "1234"]) expect(isValidLoginId(id)).toBe(true);
  for (const id of ["abc", "a".repeat(17), "Hero", "hero!", "he ro", "히어로히어로", "", 1234, null, undefined]) {
    expect(isValidLoginId(id)).toBe(false);
  }
});

// 네트워크에서 온 커맨드는 type부터 믿지 않는다. 핸들러를 고르기 전에 거절하므로 상태와 데이터를 보지 않는다.
test("applyCommand refuses a command without a numeric type or of a type that is not a command", () => {
  const state = {} as PlayerState;
  const ctx = { now: 0, data: {} as GameData };
  for (const command of [null, 7, {}, { type: "1001" }]) {
    expect(applyCommand(state, command as unknown as Command, ctx)).toMatchObject({ ok: false, error: { code: GameErrorCode.InvalidCommand } });
  }
  for (const type of [Opcode.AuthLogin, Opcode.Ping, 12345]) {
    expect(isCommandOpcode(type)).toBe(false);
    expect(applyCommand(state, { type } as unknown as Command, ctx)).toMatchObject({ ok: false, error: { code: GameErrorCode.UnknownCommand } });
  }
});
