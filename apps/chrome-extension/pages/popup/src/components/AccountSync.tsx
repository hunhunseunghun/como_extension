import { useEffect, useState } from 'react';
import { ChevronDown, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EXCHANGES } from '@/constants/exchanges';
import { useI18n } from '@/i18n';

export type SyncExchange = 'upbit' | 'binance';
export type SyncedHolding = { market: string; quantity: number; avgPrice: number };

// 백그라운드(syncExchangeAccount)와 같은 저장 키·형식이다. 키는 이 기기의 storage.local에만 둔다.
const KEYS_STORAGE = 'exchangeApiKeys';
type StoredKeys = { upbit?: { accessKey: string; secretKey: string }; binance?: { apiKey: string; secretKey: string } };

type Props = { onSynced: (exchange: SyncExchange, holdings: SyncedHolding[]) => void };

// 거래소 읽기 전용 API 키로 보유 코인을 불러온다(선택 기능, 기본 접힘).
export const AccountSync = ({ onSynced }: Props) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [exchange, setExchange] = useState<SyncExchange>('upbit');
  const [stored, setStored] = useState<StoredKeys>({});
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(KEYS_STORAGE, result => setStored((result?.[KEYS_STORAGE] as StoredKeys) ?? {}));
  }, []);

  const hasKeys = !!stored[exchange];

  const saveKeys = (next: StoredKeys) => {
    setStored(next);
    chrome.storage.local.set({ [KEYS_STORAGE]: next });
  };

  const sync = () => {
    setIsSyncing(true);
    setStatus(null);
    chrome.runtime.sendMessage(
      { action: 'syncExchangeAccount', exchange },
      (response?: { ok: boolean; holdings?: SyncedHolding[]; error?: string }) => {
        setIsSyncing(false);
        if (chrome.runtime.lastError || !response?.ok) {
          setStatus({
            tone: 'error',
            text: `${t('syncFailed')}: ${response?.error ?? chrome.runtime.lastError?.message ?? ''}`,
          });
          return;
        }
        onSynced(exchange, response.holdings ?? []);
        setStatus({ tone: 'ok', text: t('syncDone').replace('{n}', String(response.holdings?.length ?? 0)) });
      },
    );
  };

  const handleSaveAndSync = () => {
    if (!publicKey.trim() || !secretKey.trim()) return;
    const keys =
      exchange === 'upbit'
        ? { ...stored, upbit: { accessKey: publicKey.trim(), secretKey: secretKey.trim() } }
        : { ...stored, binance: { apiKey: publicKey.trim(), secretKey: secretKey.trim() } };
    saveKeys(keys);
    setPublicKey('');
    setSecretKey('');
    // 저장이 끝난 뒤 백그라운드가 키를 읽도록 다음 틱에 동기화한다.
    setTimeout(sync, 0);
  };

  const removeKeys = () => {
    const next = { ...stored };
    delete next[exchange];
    saveKeys(next);
    setStatus(null);
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
                {stored[key] && ' ✓'}
              </Button>
            ))}
          </div>
          {hasKeys ? (
            <div className="flex gap-1">
              <Button className="h-control flex-1 text-cap-s hover:cursor-pointer" disabled={isSyncing} onClick={sync}>
                {isSyncing ? t('syncing') : t('syncNow')}
              </Button>
              <Button variant="soft" className="h-control px-2 text-cap-s hover:cursor-pointer" onClick={removeKeys}>
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
