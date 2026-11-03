import { readFileSync } from "node:fs";
import { loadGameData, type StringsId } from "@idle/data-schema";
import { computed } from "@preact/signals-core";
import { expect, test } from "vitest";
import { languageNames, placeholders } from "../src/presentation/text.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));

test("a key becomes the sentence of the language with its named arguments filled in", () => {
  const { t, language } = texts(data);
  expect(t("common.empty")).toBe("비어 있음");
  expect(t("battle.levelUp", { level: 12 })).toBe("레벨 업! Lv.12");
  expect(t("login.idRule", { min: 4, max: 16 })).toBe("아이디는 영문 소문자, 숫자, _로 4~16자입니다.");
  language.value = "en";
  expect(t("battle.stageClear", { stage: t("stage.goblinCamp") })).toBe("Goblin Camp cleared");
  // 넘기지 않은 인자의 자리는 그대로 남고, 남는 인자는 쓰이지 않는다.
  expect(t("battle.levelUp", { stage: 1 })).toBe("Level up! Lv.{level}");
});

test("a key missing from the table shows the key itself", () => {
  expect(texts(data).t("item.none" as StringsId)).toBe("item.none");
});

test("a signal that reads a sentence follows the language", () => {
  const { t, language } = texts(data);
  const seen: string[] = [];
  computed(() => t("menu.settings")).subscribe(text => seen.push(text));
  language.value = "en";
  language.value = "en";
  language.value = "ko";
  expect(seen).toEqual(["설정", "Settings", "설정"]);
});

test("every language fills each key with the same named arguments", () => {
  const names = Object.keys(languageNames(data.strings)) as (keyof ReturnType<typeof languageNames>)[];
  const mismatched = [...data.strings.values()].filter(row => {
    const [first, ...others] = names.map(language => placeholders(row[language]).sort().join(","));
    return others.some(other => other !== first);
  });
  expect(mismatched.map(row => row.id)).toEqual([]);
});

test("the languages are the table's language columns, each named in itself", () => {
  expect(languageNames(data.strings)).toEqual({ ko: "한국어", en: "English" });
  expect(placeholders("{id}  Lv.{level}  {exp}")).toEqual(["id", "level", "exp"]);
});
