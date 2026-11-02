import { invoke } from '@tauri-apps/api/core';
import type { PreviewSettings, Project } from '$lib/project/types';

/**
 * 전투 미리보기: 프로젝트가 가리키는 스크립트(previewSettings)를 node로 실행해 요청 `{ project, ...values }`를 주고
 * 결과 JSON을 받는다. 툴은 결과의 모양을 모르고 그대로 보인다.
 */
export async function runPreview(
  projectPath: string,
  settings: PreviewSettings,
  project: Project,
  values: Record<string, number>,
): Promise<unknown> {
  const request = JSON.stringify({ project, ...values });
  return JSON.parse(await invoke<string>('run_preview', { projectPath, settings, request }));
}
