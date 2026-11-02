/**
 * 앱 설정: 플레이어 빌드가 고른 환경(client/config/local.json, live.json)의 주소. 엔진이 글로 주고(RuntimeFacade.Config),
 * 부트는 `patch`로 패치하고 게임은 `server`로 접속한다. 같은 게임 번들이 어느 환경에서나 돈다.
 */
export interface AppConfig {
  /** 환경 이름(local, live). 로그에 남긴다. */
  readonly environment: string;
  /** 게임 서버의 origin. 예: ws://localhost:8080, wss://idle.dennou.cloud. */
  readonly server: string;
  /** 패치 버킷의 주소(끝이 `/`). 예: http://localhost:8081/. */
  readonly patch: string;
}

// 자리표시(`<…>`)가 남은 주소는 받지 않는다. 플레이어 빌드 전처리(TypeScriptBuildValidation)도 막는다.
const SERVER = /^wss?:\/\/[^\s/<>]+$/;
const PATCH = /^https?:\/\/[^\s<>]+\/$/;

/** 앱 설정을 검사해 읽는다. 틀리면 throw한다. */
export function parseAppConfig(text: string): AppConfig {
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== "object" || value === null || !("environment" in value) || !("server" in value) || !("patch" in value)
    || typeof value.environment !== "string" || value.environment === ""
    || typeof value.server !== "string" || !SERVER.test(value.server)
    || typeof value.patch !== "string" || !PATCH.test(value.patch)
  ) {
    throw new Error(`The app config is malformed: ${text}`);
  }
  return { environment: value.environment, server: value.server, patch: value.patch };
}
