import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Moon, Sun } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { useTheme } from '@/components/ThemeProvider';
export function ModeToggle() {
    const { theme, setTheme } = useTheme();
    const switchTheme = () => (theme === 'dark' ? setTheme('light') : setTheme('dark'));
    return (_jsxs(Toggle, { className: "hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1", variant: "outline", onClick: switchTheme, children: [_jsx(Moon, { size: 14, strokeWidth: 2, className: "size-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" }), _jsx(Sun, { size: 14, strokeWidth: 2, className: "absolute size-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" }), _jsx("span", { className: "sr-only", children: "toggle theme" })] }));
}
