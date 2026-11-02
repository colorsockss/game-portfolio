import type { GameData } from "@idle/data-schema";
import { Big } from "@idle/big-number";
import { BattleMode, isUnlocked, TICK_MS, type BattleSnapshot } from "@idle/game-core";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { BattleService } from "../../application/battle/battle.js";
import type { AppState } from "../../application/state/app-state.js";
import { formatTimer } from "../format/time.js";
import type { Translate } from "../text.js";
import type { Badge } from "../widgets/badge.js";
import { createCurrencyBarViewModel, type CurrencyBarViewModel } from "../widgets/currency.js";

/** 전투 수치의 값. */
interface HudState {
  /** 사냥 중에는 깬 웨이브 수/목표("2/3"), 보스 중에는 "보스". 전투가 없으면 비어 있다. */
  readonly waves: string;
  /** 보스의 남은 제한 시간. 보스 중이 아니거나 제한이 없으면 비어 있다. */
  readonly bossTime: string;
  /** 보스 도전 버튼을 보인다: 사냥 중이고, 자동 도전이 꺼졌고, 웨이브 수가 찼고, 보스가 있다. */
  readonly canChallenge: boolean;
}

/** 메인 화면 위쪽에 보이는 전투의 수치. 전투 서비스의 스냅숏이 바뀔 때 바뀐다. */
export type BattleHud = { readonly [K in keyof HudState]: ReadonlySignal<HudState[K]> };

/** 메인 화면: 서버가 마지막으로 확정한 플레이어의 저장 데이터와, 서버로 가는 중인 것. */
export interface MainViewModel {
  /** "hero  Lv.3  42%": 보이는 전투의 레벨과 다음 레벨까지 모은 경험치. 최대 레벨이면 "MAX". */
  readonly title: ReadonlySignal<string>;
  /** 다음 레벨까지 모은 경험치의 비율(0~1). 최대 레벨이면 1, 저장 데이터가 없으면 0. */
  readonly exp: ReadonlySignal<number>;
  /** 위쪽의 재화 바. 보이는 보유량이라 처치마다 오른다. */
  readonly currencies: CurrencyBarViewModel;
  /** Stages 테이블에서 가져온 현재 스테이지의 이름. */
  readonly stage: ReadonlySignal<string>;
  /** 위쪽에 보이는 전투의 수치. */
  readonly hud: BattleHud;
  /** 지금 스테이지 말고 해금된 스테이지가 있다. 다음 스테이지 버튼을 보인다. */
  readonly canChangeStage: ReadonlySignal<boolean>;
  /** 보스에 도전한다. */
  challenge(): void;
  /** 해금된 스테이지 중 ID 순서로 다음 스테이지로 옮긴다. 마지막 다음은 처음이다. */
  nextStage(): void;
  /** 가방을 연다. */
  openInventory(): void;
  /** 장비 화면을 연다. */
  openEquipment(): void;
  /** 골드 능력치 강화 화면을 연다. */
  openUpgrade(): void;
  /** 스킬 화면을 연다. */
  openSkills(): void;
  /** 환생 화면을 연다. */
  openRebirth(): void;
  /** 장비 버튼의 뱃지: 입은 것보다 좋은 장비가 있다. */
  readonly equipmentBadge: Badge;
  /** 설정 화면을 연다. 로그아웃도 거기에 있다. */
  openSettings(): void;
}

export interface MainViewModelOptions {
  readonly state: AppState;
  readonly data: GameData;
  /** 화면의 문장. 언어가 바뀌면 제목, 스테이지 이름, 전투 수치가 다시 계산된다. */
  readonly t: Translate;
  /**
   * 스테이지를 옮기고 보스에 도전하며(거절이나 전송 실패는 서비스가 로그에 남긴다) 스냅숏으로 전투 수치와 레벨을,
   * 보이는 보유량으로 골드와 경험치를 보인다.
   */
  readonly battle: Pick<BattleService, "selectStage" | "bossChallenge" | "snapshot" | "items">;
  /** 가방 화면을 연다(presentation/screens.ts). */
  readonly openInventory: () => void;
  /** 장비 화면을 연다(presentation/screens.ts). */
  readonly openEquipment: () => void;
  /** 골드 능력치 강화 화면을 연다(presentation/screens.ts). */
  readonly openUpgrade: () => void;
  /** 스킬 화면을 연다(presentation/screens.ts). */
  readonly openSkills: () => void;
  /** 환생 화면을 연다(presentation/screens.ts). */
  readonly openRebirth: () => void;
  /** 장비 뱃지 트리의 뿌리(EquipmentBadges.any). */
  readonly equipmentBadge: Badge;
  /** 설정 화면을 연다(presentation/screens.ts). */
  readonly openSettings: () => void;
}

const NO_HUD: HudState = { waves: "", bossTime: "", canChallenge: false };

function hudOf(snapshot: BattleSnapshot | undefined, t: Translate): HudState {
  if (!snapshot) return NO_HUD;
  const hunting = snapshot.mode === BattleMode.Hunt;
  return {
    // 웨이브 수는 규칙에서 목표를 넘지 않으므로, 보스에게 져서 사냥이 이어져도 목표에 머문다.
    waves: hunting ? `${snapshot.waves}/${snapshot.wavesNeeded}` : t("main.boss"),
    bossTime: !hunting && snapshot.bossTicksLeft !== null ? formatTimer(snapshot.bossTicksLeft * TICK_MS, t) : "",
    canChallenge: hunting && !snapshot.autoBoss && snapshot.waves >= snapshot.wavesNeeded && snapshot.hasBoss,
  };
}

export function createMainViewModel(
  { state, data, t, battle, openInventory, openEquipment, openUpgrade, openSkills, openRebirth, equipmentBadge, openSettings }: MainViewModelOptions,
): MainViewModel {
  // 이 화면은 main 상태만 보여 주고, 그 상태에는 저장 데이터가 있다.
  const player = () => state.player.value!;
  const stageIds = [...data.stages.keys()].sort((a, b) => a - b);
  const hud = computed(() => hudOf(battle.snapshot.value, t));
  // 레벨은 경계에서 오르므로 보이는 전투를 따른다. 보이는 전투가 없으면 저장된 레벨이다. 프레임마다 바뀌는 스냅숏에도
  // 레벨이 바뀔 때만 알린다.
  const level = computed(() => battle.snapshot.value?.hero.level ?? state.player.value?.profile.level ?? 0);
  // 커맨드가 정산한 뒤 보는 클리어와 레벨은 보이는 것 이상이라서, 여기서 해금된 스테이지는 서버도 받아들인다.
  const unlockedIds = computed(() => {
    const save = state.player.value;
    if (!save) return [];
    const shown = { profile: { ...save.profile, level: level.value }, stage: save.stage };
    return stageIds.filter(id => isUnlocked(data.stages.get(id)!, shown));
  });
  // 다음 레벨까지 모은 경험치의 비율. 최대 레벨이면 null.
  const ratio = computed(() => {
    const need = data.heroLevels.get(level.value)?.expToNext ?? null;
    const exp = battle.items.value[data.constants.expItemId] ?? Big.ZERO;
    return need === null ? null : Big.toNumber(Big.div(exp, need));
  });
  return {
    title: computed(() => {
      const save = state.player.value;
      if (!save) return "";
      const shown = ratio.value;
      const exp = shown === null ? t("main.maxLevel") : `${Math.floor(shown * 100)}%`;
      return t("main.title", { id: save.profile.loginId, level: level.value, exp });
    }),
    exp: computed(() => (state.player.value ? Math.min(1, ratio.value ?? 1) : 0)),
    currencies: createCurrencyBarViewModel({ data, items: battle.items }),
    stage: computed(() => {
      const save = state.player.value;
      const row = save && data.stages.get(save.stage.currentId);
      return row ? t(row.nameKey) : "";
    }),
    hud: {
      waves: computed(() => hud.value.waves),
      bossTime: computed(() => hud.value.bossTime),
      canChallenge: computed(() => hud.value.canChallenge),
    },
    canChangeStage: computed(() => unlockedIds.value.some(id => id !== state.player.value?.stage.currentId)),
    challenge: () => battle.bossChallenge(),
    nextStage: () => {
      const ids = unlockedIds.value;
      if (ids.length > 0) battle.selectStage(ids[(ids.indexOf(player().stage.currentId) + 1) % ids.length]);
    },
    openInventory,
    openEquipment,
    openUpgrade,
    openSkills,
    openRebirth,
    equipmentBadge,
    openSettings,
  };
}
