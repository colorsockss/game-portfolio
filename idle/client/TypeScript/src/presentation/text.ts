import type { GameData, StringsId } from "@idle/data-schema";
import type { ReadonlySignal } from "@preact/signals-core";
import type { Language } from "../application/settings/settings.js";

/** 화면 문장의 키(Strings 테이블의 id). 생성된 리터럴 유니온이라 테이블에 없는 키는 타입 검사가 잡는다. */
export type TextKey = StringsId;

/** 문장의 `{이름}` 자리에 넣을 값. 큰 수와 시간은 표기(formatBig, formatTimer)로 바꿔 넘긴다. */
export type TextArgs = Readonly<Record<string, string | number>>;

/**
 * 키와 이름 붙인 인자로 지금 언어의 문장을 만든다. 언어 신호를 읽으므로 `computed` 안에서 부르면 언어가 바뀔 때 다시
 * 계산되고, 그 신호에 바인딩한 화면이 다시 그려진다. 넘기지 않은 인자의 자리는 `{이름}` 그대로 남는다.
 */
export type Translate = (key: TextKey, args?: TextArgs) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

export function createTranslate(strings: GameData["strings"], language: ReadonlySignal<Language>): Translate {
  return (key, args = {}) => {
    const row = strings.get(key);
    // 키 타입과 테이블은 같은 데이터에서 생성되므로 실제로는 늘 있다. 키가 빠진 가짜 데이터(테스트)는 키를 보인다.
    if (!row) return key;
    return row[language.value].replace(PLACEHOLDER, (slot, name: string) => (Object.prototype.hasOwnProperty.call(args, name) ? String(args[name]) : slot));
  };
}

/** 문장의 `{이름}` 자리를 나온 순서로. 같은 키의 언어들은 같은 자리를 가져야 한다(테스트가 모든 줄을 본다). */
export function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map(match => match[1]);
}

/**
 * 언어마다 그 언어로 쓴 이름(Strings의 `language.name` 줄): 언어를 고르는 탭은 지금 언어와 상관없이 이 이름을 보인다.
 * 키의 순서가 Strings의 열 순서라서 고를 수 있는 언어의 목록이기도 하다.
 */
export function languageNames(strings: GameData["strings"]): Readonly<Record<Language, string>> {
  const { id: _, ...names } = strings.get("language.name")!;
  return names;
}
