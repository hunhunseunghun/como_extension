import { useEffect, useState } from 'react';
import { ChevronDown, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EXCHANGES } from '@/constants/exchanges';
import { useI18n, type MessageKey } from '@/i18n';

export type SyncExchange = 'upbit' | 'binance';
// avgEstimated: 거래소가 평균 매수가를 주지 않아 불러온 시점 가격으로 채웠다(바이낸스).
export type SyncedHolding = { market: string; quantity: number; avgPrice: number; avgEstimated?: boolean };

// 백그라운드(syncExchangeAccount)와 같은 저장 키·형식이다.
// '이 기기에 저장'을 켜면 storage.local, 끄면 storage.session(브라우저를 닫으면 지워짐)에 둔다.
const KEYS_STORAGE = 'exchangeApiKeys';
type StoredKeys = { upbit?: { accessKey: string; secretKey: string }; binance?: { apiKey: string; secretKey: string } };

// 백그라운드가 돌려주는 오류 코드 → 안내 문구
const SYNC_ERROR_MESSAGES: Record<string, MessageKey> = {
  ip: 'syncErrorIp',
  invalidKey: 'syncErrorInvalidKey',
  expired: 'syncErrorExpired',
  permission: 'syncErrorPermission',
  tradeKey: 'syncErrorTradeKey',
  network: 'syncErrorNetwork',
  noKeys: 'syncErrorNoKeys',
};

type Props = { onSynced: (exchange: SyncExchange, holdings: SyncedHolding[]) => void };

// 거래소 읽기 전용 API 키로 보유 코인을 불러온다(선택 기능, 기본 접힘).
export const AccountSync = ({ onSynced }: Props) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [exchange, setExchange] = useState<SyncExchange>('upbit');
  const [stored, setStored] = useState<StoredKeys>({});
  const [sessionKeys, setSessionKeys] = useState<StoredKeys>({});
  const [remember, setRemember] = useState(true);
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(KEYS_STORAGE, result => setStored((result?.[KEYS_STORAGE] as StoredKeys) ?? {}));
    chrome.storage.session.get(KEYS_STORAGE, result => setSessionKeys((result?.[KEYS_STORAGE] as StoredKeys) ?? {}));
  }, []);

  const hasKeys = !!(stored[exchange] ?? sessionKeys[exchange]);

  const saveKeys = (next: StoredKeys) => {
    setStored(next);
    chrome.storage.local.set({ [KEYS_STORAGE]: next });
  };

  const saveSessionKeys = (next: StoredKeys) => {
    setSessionKeys(next);
    chrome.storage.session.set({ [KEYS_STORAGE]: next });
  };

  const sync = () => {
    setIsSyncing(true);
    setStatus(null);
    chrome.runtime.sendMessage(
      { action: 'syncExchangeAccount', exchange },
      (response?: { ok: boolean; holdings?: SyncedHolding[]; code?: string; error?: string }) => {
        setIsSyncing(false);
        if (chrome.runtime.lastError || !response?.ok) {
          const messageKey = response?.code ? SYNC_ERROR_MESSAGES[response.code] : undefined;
          setStatus({
            tone: 'error',
            text: `${t('syncFailed')}: ${messageKey ? t(messageKey) : (response?.error ?? chrome.runtime.lastError?.message ?? '')}`,
          });
          // 거래·출금이 가능한 키는 남겨 두지 않는다.
          if (response?.code === 'tradeKey') removeKeys(false);
          return;
        }
        onSynced(exchange, response.holdings ?? []);
        setStatus({ tone: 'ok', text: t('syncDone').replace('{n}', String(response.holdings?.length ?? 0)) });
      },
    );
  };

  const handleSaveAndSync = () => {
    if (!publicKey.trim() || !secretKey.trim()) return;
    const entry =
      exchange === 'upbit'
        ? { upbit: { accessKey: publicKey.trim(), secretKey: secretKey.trim() } }
        : { binance: { apiKey: publicKey.trim(), secretKey: secretKey.trim() } };
    // 고른 곳에만 두고 다른 쪽의 예전 키는 지운다.
    const others = (keys: StoredKeys) => {
      const next = { ...keys };
      delete next[exchange];
      return next;
    };
    if (remember) {
      saveKeys({ ...stored, ...entry });
      saveSessionKeys(others(sessionKeys));
    } else {
      saveSessionKeys({ ...sessionKeys, ...entry });
      saveKeys(others(stored));
    }
    setPublicKey('');
    setSecretKey('');
    // 저장이 끝난 뒤 백그라운드가 키를 읽도록 다음 틱에 동기화한다.
    setTimeout(sync, 0);
  };

  const removeKeys = (clearStatus = true) => {
    const next = { ...stored };
    delete next[exchange];
    saveKeys(next);
    const nextSession = { ...sessionKeys };
    delete nextSession[exchange];
    saveSessionKeys(nextSession);
    if (clearStatus) setStatus(null);
  };

  return (
    <div className="mt-2 border-t pt-1" data-testid="account-sync">
      <button
        type="button"
        className="flex w-full items-center gap-1 py-0.5 text-fg-subtle hover:cursor-pointer"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}>
        <KeyRound className="size-3" />
        <span className="flex-1 text-left">{t('accountSync')}</span>
        <ChevronDown className={`size-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="flex flex-col gap-1 pt-1">
          <div className="flex gap-1">
            {(['upbit', 'binance'] as const).map(key => (
              <Button
                key={key}
                variant={exchange === key ? 'default' : 'soft'}
                aria-pressed={exchange === key}
                className="h-control flex-1 gap-1 px-1 text-cap-s hover:cursor-pointer"
                onClick={() => {
                  setExchange(key);
                  setStatus(null);
                }}>
                <img src={EXCHANGES[key].logo} className="size-3" />
                {t(EXCHANGES[key].labelKey)}
                {(stored[key] ?? sessionKeys[key]) && ' ✓'}
              </Button>
            ))}
          </div>
          {hasKeys ? (
            <div className="flex gap-1">
              <Button className="h-control flex-1 text-cap-s hover:cursor-pointer" disabled={isSyncing} onClick={sync}>
                {isSyncing ? t('syncing') : t('syncNow')}
              </Button>
              <Button variant="soft" className="h-control px-2 text-cap-s hover:cursor-pointer" onClick={() => removeKeys()}>
                {t('removeKeys')}
              </Button>
            </div>
          ) : (
            <>
              <Input
                aria-label={exchange === 'upbit' ? 'Access key' : 'API key'}
                placeholder={exchange === 'upbit' ? 'Access key' : 'API key'}
                autoComplete="off"
                className="h-control px-2 text-cap-s"
                value={publicKey}
                onChange={event => setPublicKey(event.target.value)}
              />
              <Input
                aria-label="Secret key"
                placeholder="Secret key"
                type="password"
                autoComplete="off"
                className="h-control px-2 text-cap-s"
                value={secretKey}
                onChange={event => setSecretKey(event.target.value)}
              />
              <label className="flex items-center gap-1 text-cap-s text-fg-subtle hover:cursor-pointer">
                <input
                  type="checkbox"
                  className="size-3 accent-(--como-fg-highlight)"
                  checked={remember}
                  onChange={event => setRemember(event.target.checked)}
                />
                {t('rememberKeys')}
              </label>
              {!remember && <p className="text-cap-s text-fg-faint">{t('rememberKeysOff')}</p>}
              <Button
                className="h-control text-cap-s hover:cursor-pointer"
                disabled={!publicKey.trim() || !secretKey.trim() || isSyncing}
                onClick={handleSaveAndSync}>
                {t('saveAndSync')}
              </Button>
            </>
          )}
          {status && (
            <div className={`text-cap-s ${status.tone === 'error' ? 'text-fg-critical' : 'text-fg-subtle'}`}>
              {status.text}
            </div>
          )}
          <p className="text-cap-s text-fg-faint">
            {t(exchange === 'upbit' ? 'accountSyncHintUpbit' : 'accountSyncHintBinance')}
          </p>
        </div>
      )}
    </div>
  );
};
