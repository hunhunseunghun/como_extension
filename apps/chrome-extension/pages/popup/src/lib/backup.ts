// 설정 백업·복원. 다른 기기로 옮기거나 브라우저를 다시 설치할 때 쓴다.
// 거래소 API 키와 알림 발송 상태·통계처럼 기기에 묶인 값은 담지 않는다.
const STORAGE_KEYS = [
  'favoriteCoins',
  'priceAlerts',
  'deadbandSettings',
  'alertRules',
  'portfolio',
  'dexWatchlist',
  'badgeSettings',
  'language',
  'upDownColors',
  'displayCurrency',
  'listingAlerts',
  'wideSize',
] as const;
const LOCAL_KEYS = ['como-ui-theme', 'como-ds'] as const;
const FORMAT = 'como-backup';

type Backup = { format: typeof FORMAT; version: 1; createdAt: string; storage: Record<string, unknown>; local: Record<string, string> };

export const exportBackup = async () => {
  const storage = await chrome.storage.local.get([...STORAGE_KEYS]);
  const local: Record<string, string> = {};
  for (const key of LOCAL_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) local[key] = value;
    } catch {
      // localStorage를 쓸 수 없는 환경
    }
  }
  const backup: Backup = { format: FORMAT, version: 1, createdAt: new Date().toISOString(), storage, local };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `como-backup-${backup.createdAt.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// 알 수 없는 파일이면 false. 허용한 키만 되돌리고, 알림 발송 상태는 새로 시작하도록 비운다.
export const importBackup = async (file: File) => {
  let backup: Partial<Backup>;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    return false;
  }
  if (backup?.format !== FORMAT || typeof backup.storage !== 'object' || !backup.storage) return false;
  const storage = Object.fromEntries(
    Object.entries(backup.storage).filter(([key]) => (STORAGE_KEYS as readonly string[]).includes(key)),
  );
  await chrome.storage.local.set({ ...storage, triggeredPrices: {}, alertRuleState: {} });
  for (const [key, value] of Object.entries(backup.local ?? {})) {
    if ((LOCAL_KEYS as readonly string[]).includes(key) && typeof value === 'string') {
      try {
        localStorage.setItem(key, value);
      } catch {
        // localStorage를 쓸 수 없는 환경
      }
    }
  }
  return true;
};
