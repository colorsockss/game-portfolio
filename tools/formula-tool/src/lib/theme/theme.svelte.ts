import { parseStoredMode, resolveTheme, type ResolvedTheme, type ThemeMode } from './theme-logic';

const STORAGE_KEY = 'bf-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

class ThemeStore {
  mode = $state<ThemeMode>(parseStoredMode(localStorage.getItem(STORAGE_KEY)));
  systemDark = $state(window.matchMedia(DARK_QUERY).matches);

  get current(): ResolvedTheme {
    return resolveTheme(this.mode, this.systemDark);
  }

  constructor() {
    window.matchMedia(DARK_QUERY).addEventListener('change', (e) => {
      this.systemDark = e.matches;
      this.apply();
    });
    this.apply();
  }

  private apply(): void {
    document.documentElement.dataset.theme = this.current;
  }

  toggle(): void {
    this.mode = this.current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, this.mode);
    this.apply();
  }
}

export const themeStore = new ThemeStore();
