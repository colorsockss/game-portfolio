/** 로그인 ID 길이의 범위(양 끝 포함). 클라이언트와 서버의 안내 문구도 이 값으로 만든다. */
export const LOGIN_ID_LENGTH = { min: 4, max: 16 } as const;

/**
 * 로그인 ID: 영문 소문자, 숫자, 밑줄 LOGIN_ID_LENGTH자. 클라이언트는 플레이어가 입력하는 동안 검사하고
 * 서버는 이에 맞지 않는 것을 모두 거절하며, 둘 다 이 규칙 하나를 쓴다.
 */
export const LOGIN_ID_PATTERN = new RegExp(`^[a-z0-9_]{${LOGIN_ID_LENGTH.min},${LOGIN_ID_LENGTH.max}}$`);

export function isValidLoginId(value: unknown): value is string {
  return typeof value === "string" && LOGIN_ID_PATTERN.test(value);
}
