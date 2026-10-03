import { useEffect, useState } from 'react';

// 사이드 패널은 오래 열어 두므로, 가려져 있는 동안에는 주기적인 조회를 멈추는 데 쓴다.
export const usePageVisible = () => {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
};
