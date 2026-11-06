import type { RefsSource } from "./refs.js";

// 바인딩이 값을 쓰고 이벤트를 듣는 Unity 객체의 모양. Unity의 컴포넌트가 이 모양에 그대로 맞으므로
// (TMP_Text와 Text는 `text`, Button은 `interactable`과 `onClick`, GameObject는 SetActive를 가진다)
// 뷰는 C# 객체를 그대로 넘기고, 테스트는 평범한 객체를 넘긴다.

/** UnityEvent. PuerTS는 같은 JS 함수를 같은 델리게이트로 바꾸므로 Add와 Remove가 짝이 맞는다. */
export interface EventSource<A extends unknown[] = []> {
  AddListener(call: (...args: A) => void): void;
  RemoveListener(call: (...args: A) => void): void;
}

export interface TextTarget {
  text: string;
}

export interface ButtonTarget {
  interactable: boolean;
  readonly onClick: EventSource;
  /** 버튼을 보이고 숨길 때 쓴다(모든 컴포넌트가 가진 gameObject). */
  readonly gameObject: ActiveTarget;
}

export interface InputTarget {
  text: string;
  readonly onValueChanged: EventSource<[string]>;
}

export interface ActiveTarget {
  SetActive(active: boolean): void;
}

/**
 * 원소마다 칸(루트에 ViewRefs가 있는 오브젝트) 하나를 보이는 목록(idle/client/Assets/Scripts/Views/ItemList.cs).
 * ViewList는 틀을 원소 수만큼 복제하고, ScrollList(LoopScrollRect)는 보이는 칸만 만들어 스크롤할 때 다시 쓴다. 칸에
 * 보일 원소가 정해지면 `Shown`이 나고, 그 칸은 `ShownItem`, 원소 번호(숨었으면 -1)는 `ShownIndex`, 칸마다 다른 번호는
 * `ShownSlot`에 있다.
 */
export interface ListTarget {
  SetCount(count: number): void;
  readonly Shown: EventSource;
  readonly ShownItem: RefsSource;
  readonly ShownIndex: number;
  readonly ShownSlot: number;
}

/** 탭 막대(idle/client/Assets/Scripts/Views/TabBar.cs). 틀 버튼을 탭 수만큼 복제하고, 고른 탭은 누를 수 없다. */
export interface TabBarTarget {
  SetCount(count: number): void;
  SetLabel(index: number, label: string): void;
  /** 범위 밖 번호면 모든 탭을 누를 수 있다. */
  Select(index: number): void;
  /** 그 탭 버튼의 onClick. */
  GetClickEvent(index: number): EventSource;
  /** 그 탭의 알림 뱃지(탭 틀의 자식 Badge). 틀에 없으면 null. */
  GetBadge(index: number): ActiveTarget | null;
}

/** 켜고 끄는 토글(UnityEngine.UI.Toggle). onValueChanged는 플레이어가 바꿀 때만 나게 쓴다. */
export interface ToggleTarget {
  readonly isOn: boolean;
  SetIsOnWithoutNotify(on: boolean): void;
  readonly onValueChanged: EventSource<[boolean]>;
}

/**
 * 놓을 때를 알리는 슬라이더(idle/client/Assets/Scripts/Views/ReleaseSlider.cs, UnityEngine.UI.Slider). 값은 0~1이고,
 * onValueChanged는 플레이어가 끄는 동안 값마다 난다.
 */
export interface SliderTarget {
  readonly value: number;
  SetValueWithoutNotify(value: number): void;
  readonly onValueChanged: EventSource<[number]>;
  /** 끌던 슬라이더를 놓으면 난다. */
  readonly Released: EventSource;
}

/** 전투 월드의 배우(idle/client/Assets/Scripts/Views/ActorView.cs). */
export interface ActorTarget {
  /** `facing`은 바라보고 찌르는 쪽이다(1이면 오른쪽, -1이면 왼쪽). */
  Setup(clips: string, r: number, g: number, b: number, size: number, facing: number): void;
  Place(x: number, y: number): void;
  /** `seconds` 동안 그 자리로 옮겨 간다. `walking`이면 걷기(등장) 클립을 재생한다. */
  MoveTo(x: number, y: number, seconds: number, walking: boolean): void;
  Attack(clip: string, impactSeconds: number): void;
  Hit(hpRatio: number): void;
  SetHp(hpRatio: number): void;
  Die(): void;
  Leave(): void;
  Revive(hpRatio: number): void;
}

/** 배우 머리 위의 효과 칸(idle/client/Assets/Scripts/Views/EffectIcons.cs). */
export interface EffectIconsTarget {
  SetCount(count: number): void;
  Show(index: number, icon: string, r: number, g: number, b: number, seconds: number, total: number): void;
}

/** 날아가는 발사체(idle/client/Assets/Scripts/Views/ProjectileView.cs). */
export interface ProjectileTarget {
  Fly(clip: string, fromX: number, fromY: number, toX: number, toY: number, seconds: number, r: number, g: number, b: number, size: number): void;
  Fizzle(): void;
}

/** 전투 월드의 배경과 파티클, 장면이 바뀔 때 무대를 덮는 막(idle/client/Assets/Scripts/Views/StageView.cs). */
export interface StageTarget {
  /** 처음이면 바로 보이고, 보이던 배경과 다르면 무대를 검게 덮은 순간에 바꾼다. */
  Show(background: string): void;
  Cover(r: number, g: number, b: number): void;
  Scroll(distance: number, seconds: number): void;
  Burst(x: number, y: number, r: number, g: number, b: number, count: number, size: number): void;
}

/** 이름으로 고른 아이콘을 보이는 UI 이미지(idle/client/Assets/Scripts/Views/IconView.cs). 빈 이름이나 없는 이름이면 숨는다. */
export interface IconTarget {
  Show(name: string): void;
}

/**
 * 번호로 고른 색을 입히는 UI 그래픽(idle/client/Assets/Scripts/Views/TintView.cs). 색표(장비 등급, 스킬 속성)는 빌더가 테마에서
 * 넣고, 범위 밖 번호는 0번 색이다.
 */
export interface TintTarget {
  Show(index: number): void;
}

/**
 * 이름으로 고른 높이로 옮기는 UI(idle/client/Assets/Scripts/Views/DockView.cs). 이름과 높이는 빌더가 넣고, 없는 이름은 0번
 * 높이다.
 */
export interface DockTarget {
  Show(key: string): void;
}

/** 전투 월드에 떠오르는 글자(idle/client/Assets/Scripts/Views/FloatingText.cs). `size`는 크기 배율이다. */
export interface FloatingTextTarget {
  /** `grounded`면 영웅이 걷는 동안 배경처럼 흐른다(맞은 배우 위의 숫자). */
  Show(text: string, r: number, g: number, b: number, size: number, x: number, y: number, grounded: boolean): void;
}

/**
 * ViewRefs 인스펙터의 "Copy TS"가 쓰는 Unity 타입의 전체 이름을 바인딩이 쓰는 모양에 대응시킨다.
 * 목록에 없는 이름은 `unknown`으로 읽히므로, 뷰에 필요해지면 한 줄을 더한다. C# 타입이 아니라
 * 모양으로 두는 것은, 생성된 타입 선언(types/csharp.d.ts)에는 우리 파사드와 뷰 컴포넌트만 있고
 * Unity 컴포넌트는 없으며, 테스트가 평범한 객체를 넘길 수 있게 하기 위해서다.
 */
export interface UnityTypes {
  "UnityEngine.GameObject": ActiveTarget;
  "UnityEngine.UI.Text": TextTarget;
  "TMPro.TMP_Text": TextTarget;
  "TMPro.TextMeshProUGUI": TextTarget;
  "UnityEngine.UI.Button": ButtonTarget;
  "UnityEngine.UI.InputField": InputTarget;
  "TMPro.TMP_InputField": InputTarget;
  "PortfolioIdleRpg.Views.ViewRefs": RefsSource;
  "PortfolioIdleRpg.Views.ActorView": ActorTarget;
  "PortfolioIdleRpg.Views.EffectIcons": EffectIconsTarget;
  "PortfolioIdleRpg.Views.ProjectileView": ProjectileTarget;
  "PortfolioIdleRpg.Views.FloatingText": FloatingTextTarget;
  "PortfolioIdleRpg.Views.StageView": StageTarget;
  "PortfolioIdleRpg.Views.IconView": IconTarget;
  "PortfolioIdleRpg.Views.TintView": TintTarget;
  "PortfolioIdleRpg.Views.DockView": DockTarget;
  "PortfolioIdleRpg.Views.ScrollList": ListTarget;
  "PortfolioIdleRpg.Views.TabBar": TabBarTarget;
  "UnityEngine.UI.Toggle": ToggleTarget;
  "PortfolioIdleRpg.Views.ReleaseSlider": SliderTarget;
  "UnityEngine.UI.Image": FillTarget;
  "PortfolioIdleRpg.Views.RollingText": RollingTextTarget;
  "PortfolioIdleRpg.Views.Toast": ToastTarget;
  "PortfolioIdleRpg.Views.ViewList": ListTarget;
  "PortfolioIdleRpg.Views.Fade": FadeTarget;
  "PortfolioIdleRpg.Views.Spotlight": SpotlightTarget;
}

/** 채워지는 막대: Filled 모드의 Image. */
export interface FillTarget {
  fillAmount: number;
}

/** 굴러가는 숫자 글자(idle/client/Assets/Scripts/Views/RollingText.cs). 넘기는 것은 C#의 Update가 한다. */
export interface RollingTextTarget {
  /** 굴리지 않고 바로 보인다. 굴러가던 것은 멈춘다. */
  Set(text: string): void;
  /** 줄바꿈으로 이은 표기들을 `seconds` 동안 차례로 보이고 마지막 것에서 멈춘다. */
  Roll(frames: string, seconds: number): void;
}

/**
 * 화면 전체를 가리는 막(idle/client/Assets/Scripts/Views/Fade.cs). 투명도는 C#의 Update가 옮기고, 목표에 다 가면
 * `Finished`가 난다(이미 그 투명도면 다음 프레임에).
 */
export interface FadeTarget {
  FadeTo(covered: boolean): void;
  readonly Finished: EventSource;
}

/** 잠깐 떴다 사라지는 한 줄(idle/client/Assets/Scripts/Views/Toast.cs). 새 것이 지금 것을 바꾼다. */
export interface ToastTarget {
  Show(text: string): void;
}

/**
 * 튜토리얼이 대상을 비추는 막(idle/client/Assets/Scripts/Views/Spotlight.cs). 대상 밖을 어둡게 덮어 탭을 막고 대상 자리는
 * 비워 둔다. 대상의 자리는 C#의 LateUpdate가 따라가고, 대상이 없어지거나 꺼지면 막지 않는다.
 */
export interface SpotlightTarget {
  /** 이 UI 오브젝트(컴포넌트나 GameObject)를 비춘다. */
  Focus(target: unknown): void;
  /** 걷는다. 아무것도 막지 않는다. */
  Clear(): void;
}
