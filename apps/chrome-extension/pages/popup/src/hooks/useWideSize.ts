import { useEffect, useRef, useState } from 'react';

export const useWideSize = () => {
  const [wideSize, setWideSize] = useState<boolean>(false);
  const hasLoaded = useRef(false);

  useEffect(() => {
    chrome.storage.local.get('wideSize', result => {
      setWideSize(result?.wideSize || false);
      hasLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    chrome.storage.local.set({ wideSize });
  }, [wideSize]);

  return [wideSize, setWideSize] as const;
};
