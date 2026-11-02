import type { GameData } from "@idle/data-schema";
import { signal } from "@preact/signals-core";
import type { Language } from "../../src/application/settings/settings.js";
import { createTranslate } from "../../src/presentation/text.js";

/** 테이블의 문장으로 만든 문장 함수와 그 언어 신호. 언어를 바꾸면 `t`를 읽은 신호가 다시 계산된다. */
export function texts(data: Pick<GameData, "strings">, first: Language = "ko") {
  const language = signal<Language>(first);
  return { language, t: createTranslate(data.strings, language) };
}
