import { Big } from "@idle/big-number";
import { EquipSlot, type GameData } from "@idle/data-schema";
import { BattleMode, heroRow, isUnlocked, skillLevel, TICK_MS, type BattleSnapshot } from "@idle/game-core";
import { computed, signal, type ReadonlySignal } from "@preact/signals-core";
import type { BattleService } from "../../application/battle/battle.js";
import type { AppState } from "../../application/state/app-state.js";
import { formatBig } from "../format/big.js";
import { formatTimer } from "../format/time.js";
import type { Translate } from "../text.js";
import type { Badge } from "../widgets/badge.js";
import { createCurrencyBarViewModel, type CurrencyBarViewModel } from "../widgets/currency.js";
import { elementTint } from "./skills.js";

/**
 * 아래 탭. 고른 탭의 화면이 아래 탭 위의 판으로 열린다(presentation/screens.ts). 탭을 모두 끄면 그 자리에 장착 현황 판이
 * 보인다(슬레이어 키우기는 메뉴를 닫으면 아래에 장착 스킬 덱을 보임).
 */
export type MainTab = "upgrade" | "skills" | "equipment" | "inventory" | "rebirth";

/** 장착 현황 판의 칸 하나: 슬롯에 장착한 장비나 스킬. 누르면 그 메뉴를 연다. */
export interface LoadoutSlot {
  /** 아이콘 이름. 빈 장비 슬롯은 그 슬롯의 아이콘이다. */
  readonly icon: string;
  /** 칸의 색 번호: 장비는 등급(Items.grade), 스킬은 속성(elementTint). 비었으면 0이다. */
  readonly tint: number;
  /** 장비는 강화 단계("+3", 0이면 비어 있음), 스킬은 레벨("Lv.3"). 비었으면 비어 있다. */
  readonly level: string;
  /** 이름. 비었으면 "비어 있음"이다. */
  readonly name: string;
  open(): void;
}

/** 장착 현황 판: 탭을 모두 껐을 때 아래에 보이는 지금 장착한 장비와 스킬. */
export interface Loadout {
  /** 무기, 방어구, 장신구 순서. */
  readonly equipment: ReadonlySignal<readonly LoadoutSlot[]>;
  /** 스킬 슬롯 순서(Heroes.skillSlots개). */
  readonly skills: ReadonlySignal<readonly LoadoutSlot[]>;
}

/** 전투 수치의 값. */
interface HudState {
  /** 사냥 중에는 깬 웨이브 수/목표("2/3"), 보스 중에는 "보스". 전투가 없으면 비어 있다. */
  readonly waves: string;
  /** 스테이지 막대의 채움(0~1): 사냥 중에는 깬 웨이브의 비율, 보스 중에는 1. */
  readonly progress: number;
  /** 보스의 남은 제한 시간. 보스 중이 아니거나 제한이 없으면 비어 있다. */
  readonly bossTime: string;
  /** 보스 도전 버튼을 보인다: 사냥 중이고, 자동 도전이 꺼졌고, 웨이브 수가 찼고, 보스가 있다. */
  readonly canChallenge: boolean;
}

/** 메인 화면 위쪽에 보이는 전투의 수치. 전투 서비스의 스냅숏이 바뀔 때 바뀐다. */
export type BattleHud = { readonly [K in keyof HudState]: ReadonlySignal<HudState[K]> };

/** 영웅 띠의 스킬 칸 하나: 장착한 스킬(슬롯 순서)과 그 재사용 대기. */
export interface SkillBarSlot {
  readonly skillId: number;
  /** 아이콘 이름(Skills.icon). 없으면 비어 있다. */
  readonly icon: string;
  /** 속성 색 번호(elementTint). */
  readonly tint: number;
  /** 남은 재사용 대기의 비율(0~1). 0이면 준비됐다. */
  readonly cooldown: ReadonlySignal<number>;
  /** 남은 초(올림). 준비됐으면 비어 있다. */
  readonly seconds: ReadonlySignal<string>;
}

/** 전투 아래의 영웅 띠: 보이는 전투의 영웅. 전투가 없으면 비거나 0이다. */
export interface HeroStrip {
  /** HP의 비율(0~1). */
  readonly hp: ReadonlySignal<number>;
  /** "1.02K / 1.38K". */
  readonly hpText: ReadonlySignal<string>;
  /** 지금 공격력(걸린 효과 포함). */
  readonly attack: ReadonlySignal<string>;
  /** 지금 치명 확률. 예: "6.5%". */
  readonly crit: ReadonlySignal<string>;
  /** 장착한 스킬. 장착이 바뀔 때만 새 배열이고, 재사용 대기는 칸의 신호다. */
  readonly skills: ReadonlySignal<readonly SkillBarSlot[]>;
}

/** 메인 화면: 서버가 마지막으로 확정한 플레이어의 저장 데이터와, 서버로 가는 중인 것. */
export interface MainViewModel {
  /** 보이는 전투의 레벨. 예: "12". */
  readonly level: ReadonlySignal<string>;
  /** 로그인 ID. */
  readonly name: ReadonlySignal<string>;
  /** 다음 레벨까지 모은 경험치의 비율(0~1). 최대 레벨이면 1, 저장 데이터가 없으면 0. */
  readonly exp: ReadonlySignal<number>;
  /** 경험치 막대 안의 글자: "42%", 최대 레벨이면 "MAX". */
  readonly expText: ReadonlySignal<string>;
  /** 위쪽의 재화 바. 보이는 보유량이라 처치마다 오른다. */
  readonly currencies: CurrencyBarViewModel;
  /** Stages 테이블에서 가져온 현재 스테이지의 이름. */
  readonly stage: ReadonlySignal<string>;
  /** 위쪽에 보이는 전투의 수치. */
  readonly hud: BattleHud;
  /** 아래쪽 영웅 띠. */
  readonly hero: HeroStrip;
  /** 지금 스테이지 말고 해금된 스테이지가 있다. 스테이지 화살표를 보인다. */
  readonly canChangeStage: ReadonlySignal<boolean>;
  /** 보스에 도전한다. */
  challenge(): void;
  /** 해금된 스테이지 중 ID 순서로 다음 스테이지로 옮긴다. 마지막 다음은 처음이다. */
  nextStage(): void;
  /** 해금된 스테이지 중 ID 순서로 앞 스테이지로 옮긴다. 처음 앞은 마지막이다. */
  prevStage(): void;
  /** 고른 아래 탭(노란 판). 누르는 즉시 바뀐다. 처음에는 모두 꺼져 있다(null). */
  readonly tab: ReadonlySignal<MainTab | null>;
  /**
   * 보이는 판의 탭. 고른 탭의 판이 다 열린 뒤에 바뀌고(`sheetShown`), 판을 닫으면 바로 null이다(장착 현황 판이 보임). 영웅
   * 띠와 장착 현황 판이 이것을 따르므로, 새 판을 불러오는 동안 앞 판과 함께 그대로 있어 아래 영역이 깜빡이지 않는다.
   */
  readonly sheet: ReadonlySignal<MainTab | null>;
  /** 탭을 누른다: 고른 탭이면 판을 닫고, 아니면 그 탭의 판을 연다. */
  toggle(tab: MainTab): void;
  /** 고른 탭을 끈다(판의 뒤로 가기). */
  closeTab(): void;
  /** 판이 열려 보이기 시작했거나(그 탭) 닫혔다(null). 판을 여닫는 쪽(screens.ts의 openSheets)이 알린다. */
  sheetShown(tab: MainTab | null): void;
  /** 탭을 모두 껐을 때 보이는 장착 현황. */
  readonly loadout: Loadout;
  /** 장비 탭의 뱃지: 입은 것보다 좋은 장비가 있다. */
  readonly equipmentBadge: Badge;
  /** 설정 화면을 연다. 로그아웃도 거기에 있다. */
  openSettings(): void;
}

export interface MainViewModelOptions {
  readonly state: AppState;
  readonly data: GameData;
  /** 화면의 문장. 언어가 바뀌면 스테이지 이름과 전투 수치가 다시 계산된다. */
  readonly t: Translate;
  /**
   * 스테이지를 옮기고 보스에 도전하며(거절이나 전송 실패는 서비스가 로그에 남긴다) 스냅숏으로 전투 수치, 레벨, 영웅 띠를,
   * 보이는 보유량으로 골드와 경험치를 보인다.
   */
  readonly battle: Pick<BattleService, "selectStage" | "bossChallenge" | "snapshot" | "items">;
  /** 장비 뱃지 트리의 뿌리(EquipmentBadges.any). */
  readonly equipmentBadge: Badge;
  /** 설정 화면을 연다(presentation/screens.ts). */
  readonly openSettings: () => void;
}

/** 장착 현황 판의 장비 슬롯 순서와 비었을 때의 아이콘. */
const EQUIP_SLOTS: readonly (readonly [EquipSlot, string])[] = [
  [EquipSlot.Weapon, "slot_weapon"],
  [EquipSlot.Armor, "slot_armor"],
  [EquipSlot.Accessory, "slot_accessory"],
];

const NO_HUD: HudState = { waves: "", progress: 0, bossTime: "", canChallenge: false };

function hudOf(snapshot: BattleSnapshot | undefined, t: Translate): HudState {
  if (!snapshot) return NO_HUD;
  const hunting = snapshot.mode === BattleMode.Hunt;
  return {
    // 웨이브 수는 규칙에서 목표를 넘지 않으므로, 보스에게 져서 사냥이 이어져도 목표에 머문다.
    waves: hunting ? `${snapshot.waves}/${snapshot.wavesNeeded}` : t("main.boss"),
    progress: hunting ? (snapshot.wavesNeeded > 0 ? snapshot.waves / snapshot.wavesNeeded : 1) : 1,
    bossTime: !hunting && snapshot.bossTicksLeft !== null ? formatTimer(snapshot.bossTicksLeft * TICK_MS, t) : "",
    canChallenge: hunting && !snapshot.autoBoss && snapshot.waves >= snapshot.wavesNeeded && snapshot.hasBoss,
  };
}

// 치명 확률은 소수 한 자리 백분율이다(강화 화면과 같다).
const percent = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

function createHeroStrip(data: GameData, snapshot: ReadonlySignal<BattleSnapshot | undefined>): HeroStrip {
  const hero = computed(() => snapshot.value?.hero);
  // 장착이 바뀔 때만 칸을 새로 만든다. 프레임마다 바뀌는 재사용 대기는 칸의 신호가 따라간다.
  const equipped = computed(() => hero.value?.skills.map(skill => skill.skillId).join(",") ?? "");
  return {
    hp: computed(() => (hero.value && Big.gt(hero.value.maxHp, Big.ZERO) ? Big.toNumber(Big.div(hero.value.hp, hero.value.maxHp)) : 0)),
    hpText: computed(() => (hero.value ? `${formatBig(hero.value.hp)} / ${formatBig(hero.value.maxHp)}` : "")),
    attack: computed(() => (hero.value ? formatBig(hero.value.attack) : "")),
    crit: computed(() => (hero.value ? percent(hero.value.critChance) : "")),
    skills: computed(() => (equipped.value === "" ? [] : equipped.value.split(",").map(Number)).map((skillId, slot): SkillBarSlot => {
      const row = data.skills.get(skillId);
      const live = computed(() => hero.value?.skills[slot]);
      return {
        skillId,
        icon: row?.icon ?? "",
        tint: row ? elementTint(row.element) : 0,
        cooldown: computed(() => (live.value && live.value.cooldownTicks > 0 ? live.value.readyInTicks / live.value.cooldownTicks : 0)),
        seconds: computed(() => (live.value && live.value.readyInTicks > 0 ? `${Math.ceil((live.value.readyInTicks * TICK_MS) / 1000)}` : "")),
      };
    })),
  };
}

// 저장 데이터의 장착으로 장착 현황 판의 칸을 만든다. 칸을 누르면 `open`이 그 메뉴를 연다.
function createLoadout(state: AppState, data: GameData, t: Translate, open: (tab: MainTab) => void): Loadout {
  const empty = (icon: string, tab: MainTab): LoadoutSlot => ({ icon, tint: 0, level: "", name: t("common.empty"), open: () => open(tab) });
  return {
    equipment: computed(() => {
      const held = state.player.value?.equipment;
      return EQUIP_SLOTS.map(([slot, icon]) => {
        const id = held?.equipped[slot];
        const instance = id === undefined ? undefined : held?.owned[id];
        const row = instance && data.items.get(instance.itemId);
        if (!instance || !row) return empty(icon, "equipment");
        return {
          icon: row.icon, tint: row.grade ?? 0, level: instance.enhance === 0 ? "" : `+${instance.enhance}`, name: t(row.nameKey),
          open: () => open("equipment"),
        };
      });
    }),
    skills: computed(() => {
      const held = state.player.value?.skills;
      if (!held) return [];
      return Array.from({ length: heroRow(data).skillSlots }, (_, slot) => {
        const row = data.skills.get(held.equipped[slot] ?? -1);
        if (!row) return empty("", "skills");
        return {
          icon: row.icon ?? "", tint: elementTint(row.element), level: t("common.level", { level: skillLevel(held, row.id) }),
          name: t(row.nameKey), open: () => open("skills"),
        };
      });
    }),
  };
}

export function createMainViewModel({ state, data, t, battle, equipmentBadge, openSettings }: MainViewModelOptions): MainViewModel {
  // 이 화면은 main 상태만 보여 주고, 그 상태에는 저장 데이터가 있다.
  const player = () => state.player.value!;
  const stageIds = [...data.stages.keys()].sort((a, b) => a - b);
  const hud = computed(() => hudOf(battle.snapshot.value, t));
  // 레벨은 경계에서 오르므로 보이는 전투를 따른다. 보이는 전투가 없으면 저장된 레벨이다. 프레임마다 바뀌는 스냅숏에도
  // 레벨이 바뀔 때만 알린다.
  const level = computed(() => battle.snapshot.value?.hero.level ?? state.player.value?.hero.level ?? 0);
  // 커맨드가 정산한 뒤 보는 클리어와 레벨은 보이는 것 이상이라서, 여기서 해금된 스테이지는 서버도 받아들인다.
  const unlockedIds = computed(() => {
    const save = state.player.value;
    if (!save) return [];
    const shown = { hero: { ...save.hero, level: level.value }, stage: save.stage };
    return stageIds.filter(id => isUnlocked(data.stages.get(id)!, shown));
  });
  // 다음 레벨까지 모은 경험치의 비율. 최대 레벨이면 null.
  const ratio = computed(() => {
    const need = data.heroLevels.get(level.value)?.expToNext ?? null;
    const exp = battle.items.value[data.constants.expItemId] ?? Big.ZERO;
    return need === null ? null : Big.toNumber(Big.div(exp, need));
  });
  // 해금된 스테이지 중 지금 스테이지에서 `step`만큼 옮긴 스테이지로 간다(양 끝은 이어진다).
  const moveStage = (step: number) => {
    const ids = unlockedIds.value;
    if (ids.length > 0) battle.selectStage(ids[(ids.indexOf(player().stage.currentId) + step + ids.length) % ids.length]);
  };
  // 처음에는 탭이 모두 꺼져 장착 현황 판이 보인다.
  const tab = signal<MainTab | null>(null);
  const sheet = signal<MainTab | null>(null);
  const toggle = (next: MainTab) => void (tab.value = tab.value === next ? null : next);
  return {
    level: computed(() => (state.player.value ? `${level.value}` : "")),
    name: computed(() => state.player.value?.profile.loginId ?? ""),
    exp: computed(() => (state.player.value ? Math.min(1, ratio.value ?? 1) : 0)),
    expText: computed(() => {
      if (!state.player.value) return "";
      const shown = ratio.value;
      // 레벨업은 전투 경계에서 하므로 그 사이에 모은 경험치가 요구량을 넘을 수 있다. 막대처럼 100%에서 멈춘다.
      return shown === null ? t("main.maxLevel") : `${Math.min(100, Math.floor(shown * 100))}%`;
    }),
    currencies: createCurrencyBarViewModel({ data, items: battle.items }),
    stage: computed(() => {
      const save = state.player.value;
      const row = save && data.stages.get(save.stage.currentId);
      return row ? t(row.nameKey) : "";
    }),
    hud: {
      waves: computed(() => hud.value.waves),
      progress: computed(() => hud.value.progress),
      bossTime: computed(() => hud.value.bossTime),
      canChallenge: computed(() => hud.value.canChallenge),
    },
    hero: createHeroStrip(data, battle.snapshot),
    canChangeStage: computed(() => unlockedIds.value.some(id => id !== state.player.value?.stage.currentId)),
    challenge: () => battle.bossChallenge(),
    nextStage: () => moveStage(1),
    prevStage: () => moveStage(-1),
    tab,
    toggle,
    closeTab: () => void (tab.value = null),
    sheet,
    sheetShown: shown => void (sheet.value = shown),
    loadout: createLoadout(state, data, t, toggle),
    equipmentBadge,
    openSettings,
  };
}
