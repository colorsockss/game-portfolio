// UI 스택이 엔진에 바라는 것: 에셋 불러오기와 UI 캔버스. Unity가 구현하고(unity/resources.ts,
// unity/ui.ts), 테스트는 TypeScript로 구현하므로 스택은 Unity 없이 돈다.

/** 엔진이 불러온 에셋. 해제할 때까지 메모리에 남는다. */
export interface AssetHandle {
  release(): void;
}

/** 키로 에셋을 불러온다. 키는 경로 모양(UI/MainScreen)이고, 엔진이 패치로 받은 에셋(Addressables 주소)이나 앱에 든 에셋(Resources 경로)에서 찾는다. */
export interface ResourceBridge {
  /** `key`에 아무것도 없으면 reject한다. */
  load(key: string): Promise<AssetHandle>;
  /** 해제한 에셋을 메모리에서 내린다. 화면을 멈출 만큼 걸릴 수 있어 화면이 가려진 동안(상태 사이) 부른다. */
  unloadUnused(): void;
}

/**
 * 뷰가 놓이는 위치: 화면이 맨 아래, 그 위에 팝업, 그 위에 안내(튜토리얼), 그 위에 오버레이(전환 화면, 토스트, 로딩), 차단막보다
 * 위인 맨 위에 디버그.
 */
export type UiLayer = "screen" | "popup" | "guide" | "overlay" | "debug";

/** 엔진의 UI: 캔버스 하나 아래 레이어마다 자리 하나, 디버그 레이어만 빼고 그 모두 위의 차단막, 뒤로 가기 키. */
export interface UiBridge {
  /** 불러온 프리팹의 새 인스턴스를 그 레이어의 맨 위에 올린다. */
  create(prefab: AssetHandle, layer: UiLayer): UiInstance;
  /** 모든 탭을 삼키는 차단막을 보이거나 숨긴다. */
  setBlocking(blocking: boolean): void;
  /** 뒤로 가기(Android 뒤로, Esc)를 누를 때마다 `handler`를 부른다. 돌려준 함수를 부를 때까지 한다. */
  onBack(handler: () => void): () => void;
}

/** 뷰의 프리팹이 엔진에서 만든 인스턴스. 엔진의 뷰 코드만 읽는다. */
export interface ViewRoot {
  readonly __viewRoot: never;
}

export interface UiInstance {
  /** 프리팹의 인스턴스. 뷰가 읽는다. */
  readonly root: ViewRoot;
  /** 닫는 연출(팝업 틀)이 있으면 시작하고, 끝나면 이행한다. 없으면 undefined이고 바로 destroy한다. */
  dismiss(): Promise<void> | undefined;
  destroy(): void;
}
