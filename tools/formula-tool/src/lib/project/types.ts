export const ACTORS = ['caster', 'target'] as const;
export type ActorKey = (typeof ACTORS)[number];

export interface Stat {
  id: string;
  key: string;
  defaults: Record<ActorKey, number>;
  description: string;
}

export interface Constant {
  id: string;
  key: string;
  value: number;
  description: string;
}

export interface Formula {
  id: string;
  key: string;
  expression: string;
  description: string;
}

/**
 * 공식을 부르는 쪽이 넘기는 값(효과의 계수, 강화 단계 등). 모양은 상수와 같고, `value`는 툴의 시뮬레이션이 쓰는
 * 기본값이다. 생성 코드에서는 `Formula.get`의 마지막 인자(`FormulaInput`)로 받는다.
 */
export type Input = Constant;

/** 미리보기 요청의 수 하나. 툴은 뜻을 모르고 key와 값(기본값 value)을 그대로 요청에 넣는다. */
export interface PreviewField {
  key: string;
  value: number;
  description: string;
}

/**
 * 툴 안의 전투 미리보기를 돌리는 스크립트. 툴은 게임 코드를 모르므로 프로젝트가 가리키는 스크립트를 node로
 * 실행해 요청 `{ project, ...fields }`(JSON)를 표준 입력으로 주고 결과 JSON을 표준 출력으로 받아 그대로 표로 보인다.
 * 경로는 프로젝트 파일 기준이다.
 */
export interface PreviewSettings {
  script: string;
  args?: string[];
  fields?: PreviewField[];
}

export interface ExportSettings {
  abilityTypeImport: string;
  /** 생성 코드의 수 형식. 없으면 number. big이면 @idle/big-number의 Big으로 계산한다. */
  numeric?: 'number' | 'big';
  /** numeric이 big일 때 Big을 가져올 경로. 없으면 '@idle/big-number'. */
  bigImport?: string;
}

export interface Project {
  schemaVersion: number;
  name: string;
  stats: Stat[];
  constants: Constant[];
  formulas: Formula[];
  /** 없으면 입력이 없다. */
  inputs?: Input[];
  exportSettings?: ExportSettings;
  previewSettings?: PreviewSettings;
}

export const SCHEMA_VERSION = 3;
