import { Moon, Sun } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { useTheme } from '@/components/ThemeProvider';

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  const switchTheme = () => (theme === 'dark' ? setTheme('light') : setTheme('dark'));

  return (
    <Toggle
      className="hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1"
      variant="outline"
      onClick={switchTheme}>
      <Moon
        size={14}
        strokeWidth={2}
        className="size-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
      />
      <Sun
        size={14}
        strokeWidth={2}
        className="absolute size-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
      />
      <span className="sr-only">toggle theme</span>
    </Toggle>
  );
}
