import type { Config } from 'tailwindcss';

const baseConfig: Omit<Config, 'content'> = {
  theme: {
    extend: {},
  },
  plugins: [],
};

export default baseConfig;
