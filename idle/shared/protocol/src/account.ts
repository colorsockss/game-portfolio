/** AuthLogin이 내주는 값으로, 새 연결에서 AuthResume으로 세션을 이어 가는 데 쓴다. */
export interface Session {
  readonly token: string;
  /** AuthResume이 토큰을 거절하기 시작하는 시각(epoch ms). */
  readonly expiresAt: number;
}
