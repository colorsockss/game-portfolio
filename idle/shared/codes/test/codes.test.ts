import { expect, test } from "vitest";
import { GameErrorCode, Opcode } from "../src/index.js";

test.each([["Opcode", Opcode], ["GameErrorCode", GameErrorCode]] as const)("%s values are unique", (_name, codes) => {
  const values = Object.values(codes).filter(value => typeof value === "number");
  expect(new Set(values).size).toBe(values.length);
});
