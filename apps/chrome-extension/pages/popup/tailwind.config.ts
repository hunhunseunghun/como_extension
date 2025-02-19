import baseConfig from '@packages/tailwindcss-config';
import type { Config } from 'tailwindcss';

const config: Config = {
  ...baseConfig,
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
};

export default config;
