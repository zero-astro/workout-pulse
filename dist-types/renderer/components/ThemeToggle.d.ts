type ThemeMode = 'auto' | 'dark' | 'light';
interface ThemeToggleProps {
    onThemeChange: (mode: ThemeMode) => void;
}
export declare function ThemeToggle({ onThemeChange }: ThemeToggleProps): import("react/jsx-runtime").JSX.Element;
export {};
