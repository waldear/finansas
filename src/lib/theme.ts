export type AppTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'finansas-theme';

function isBrowser() {
    return typeof window !== 'undefined';
}

export function getStoredTheme(): AppTheme {
    if (!isBrowser()) return 'light';
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: AppTheme) {
    if (!isBrowser()) return;
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}
