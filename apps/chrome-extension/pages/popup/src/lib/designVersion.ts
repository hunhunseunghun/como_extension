// 디자인 시스템 버전: v1은 3.0.0까지의 화면, v2는 docs/design-system.md 기준 화면. styles/index.css의 [data-ds]가 토큰 값을 바꾼다.
export type DesignVersion = 'v1' | 'v2';
export const DESIGN_VERSION_STORAGE_KEY = 'como-ds';
export const readDesignVersion = (): DesignVersion => (localStorage.getItem(DESIGN_VERSION_STORAGE_KEY) === 'v1' ? 'v1' : 'v2');
export const applyDesignVersion = (version: DesignVersion) => {
  document.documentElement.dataset.ds = version;
};
