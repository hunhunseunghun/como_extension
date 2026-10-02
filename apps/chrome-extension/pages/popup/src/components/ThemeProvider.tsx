import { createContext, useContext, useEffect, useState } from 'react';
import { applyDesignVersion, DESIGN_VERSION_STORAGE_KEY, readDesignVersion, type DesignVersion } from '@/lib/designVersion';

type Theme = 'dark' | 'light' | 'system';


type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  designVersion: DesignVersion;
  setDesignVersion: (version: DesignVersion) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  designVersion: 'v2',
  setDesignVersion: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'comoUiTheme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme);
  const [designVersion, setDesignVersion] = useState<DesignVersion>(readDesignVersion);

  useEffect(() => applyDesignVersion(designVersion), [designVersion]);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      // OS 테마가 바뀌면 열려 있는 팝업·사이드 패널도 따라 바꾼다.
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => {
        root.classList.remove('light', 'dark');
        root.classList.add(media.matches ? 'dark' : 'light');
      };
      apply();
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    designVersion,
    setDesignVersion: (version: DesignVersion) => {
      localStorage.setItem(DESIGN_VERSION_STORAGE_KEY, version);
      setDesignVersion(version);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
