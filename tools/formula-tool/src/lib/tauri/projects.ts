import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { Project } from '$lib/project/types';

export interface RecentEntry {
  path: string;
  name: string;
  lastOpened: number;
}

const FILTERS = [{ name: '전투 공식 프로젝트', extensions: ['json'] }];

export function createProject(path: string, name: string): Promise<Project> {
  return invoke<Project>('create_project', { path, name });
}

export function readProject(path: string): Promise<Project> {
  return invoke<Project>('read_project', { path });
}

export function writeProject(path: string, project: Project): Promise<void> {
  return invoke<void>('write_project', { path, project });
}

export function listRecentProjects(): Promise<RecentEntry[]> {
  return invoke<RecentEntry[]>('list_recent_projects');
}

export function removeRecentProject(path: string): Promise<RecentEntry[]> {
  return invoke<RecentEntry[]>('remove_recent_project', { path });
}

export async function pickOpenPath(): Promise<string | null> {
  const result = await open({ multiple: false, directory: false, filters: FILTERS });
  return typeof result === 'string' ? result : null;
}

export async function pickSavePath(defaultName: string): Promise<string | null> {
  const path = await save({ defaultPath: `${defaultName}.json`, filters: FILTERS });
  if (path === null) return null;
  return path.toLowerCase().endsWith('.json') ? path : `${path}.json`;
}
