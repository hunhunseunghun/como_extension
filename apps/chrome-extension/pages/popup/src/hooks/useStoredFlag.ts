import { useCallback, useEffect, useState } from 'react';

// chrome.storage.local에 저장하는 켜고 끄는 설정. 다른 창(사이드 패널, 단축키)에서 바꿔도 바로 따라간다.
export const useStoredFlag = (key: string, fallback = false) => {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    chrome.storage.local.get(key, result => {
      if (typeof result?.[key] === 'boolean') setValue(result[key]);
    });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && key in changes) setValue(changes[key].newValue ?? fallback);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [key, fallback]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      chrome.storage.local.set({ [key]: next });
    },
    [key],
  );

  return [value, update] as const;
};

export const KIMCHI_COLUMN_KEY = 'kimchiColumnNarrow';
export const QUIET_MODE_KEY = 'quietMode';
