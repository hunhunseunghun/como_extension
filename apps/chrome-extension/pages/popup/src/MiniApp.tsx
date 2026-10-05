import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PictureInPicture2, Undo2 } from 'lucide-react';
import '@/styles/App.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { EXCHANGES, isKrwExchange } from '@/constants/exchanges';
import { QUIET_MODE_KEY, useStoredFlag } from '@/hooks/useStoredFlag';
import { useI18n } from '@/i18n';
import type { ExchangePlatform, FavoriteCoins } from '@/types';
import comoLogo from '@/assets/icons/como-logo.png';

// 미니 창: 즐겨찾기 코인만 작게 보여 주는 별도 창. 문서 PIP(항상 위에 뜨는 창)로 옮길 수 있다.
// 웹페이지 권한 없이 띄우므로 "방문하는 웹페이지를 읽지 않는다"는 약속을 지킨다.

type MiniTicker = { exchange: ExchangePlatform; market: string; currentPrice: number; changeRate: number; koreanName?: string | null };
type Item = { exchange: ExchangePlatform; market: string };

const REFRESH_MS = 1000;
const MAX_ITEMS = 20;
// 즐겨찾기가 없으면 보여 줄 기본 종목
const FALLBACK: Item[] = [
  { exchange: 'upbit', market: 'KRW-BTC' },
  { exchange: 'upbit', market: 'KRW-ETH' },
  { exchange: 'binance', market: 'BTCUSDT' },
];

const coinOf = (market: string) => (market.includes('-') ? market.split('-')[1] : market.replace(/(USDT|USD|INR|BTC)$/, ''));

const formatPrice = (price: number, market: string) => {
  if (market.startsWith('BTC-') || (market.endsWith('BTC') && !market.includes('-'))) return price.toFixed(8);
  const digits = price >= 100 ? 0 : price >= 1 ? 2 : 4;
  return price.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};

// 문서 PIP 창에 원래 문서의 스타일과 테마 속성을 옮긴다.
const copyDocumentLook = (target: Document) => {
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => target.head.appendChild(node.cloneNode(true)));
  const sync = () => {
    const root = document.documentElement;
    target.documentElement.className = root.className;
    for (const attribute of Array.from(root.attributes)) {
      if (attribute.name !== 'class') target.documentElement.setAttribute(attribute.name, attribute.value);
    }
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true });
  return () => observer.disconnect();
};

type PipWindow = Window & { document: Document };
type DocumentPip = { requestWindow: (options: { width: number; height: number }) => Promise<PipWindow> };
const documentPip = (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;

export const MiniApp = () => {
  const { t, language } = useI18n();
  const [favorites, setFavorites] = useState<FavoriteCoins | null>(null);
  const [tickers, setTickers] = useState<Record<string, MiniTicker>>({});
  const [kimchi, setKimchi] = useState<Record<string, { premium: number }>>({});
  const [pipWindow, setPipWindow] = useState<PipWindow | null>(null);
  const [quietMode] = useStoredFlag(QUIET_MODE_KEY);
  const contentRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (quietMode) document.documentElement.dataset.quiet = '';
    else delete document.documentElement.dataset.quiet;
  }, [quietMode]);

  useEffect(() => {
    document.title = `COMO · ${t('miniWindow')}`;
  }, [t]);

  useEffect(() => {
    const load = () => chrome.storage.local.get('favoriteCoins', result => setFavorites(result?.favoriteCoins ?? {}));
    load();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.favoriteCoins) load();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const items = useMemo<Item[]>(() => {
    if (!favorites) return [];
    const list = Object.entries(favorites).flatMap(([exchange, markets]) =>
      (markets ?? []).map(market => ({ exchange: exchange as ExchangePlatform, market })),
    );
    return (list.length ? list : FALLBACK).filter(item => EXCHANGES[item.exchange]).slice(0, MAX_ITEMS);
  }, [favorites]);

  // 백그라운드와 포트로 이어 둔다. 미니 창이 열려 있는 동안 이 거래소들은 쉬지 않고 시세를 받는다.
  useEffect(() => {
    if (!items.length) return;
    const port = chrome.runtime.connect({ name: 'mini' });
    const exchanges = [...new Set(items.map(item => item.exchange))];
    const keys = items.map(item => `${item.exchange}:${item.market}`);
    port.onMessage.addListener(({ type, data }) => {
      if (type === 'miniTickers') {
        setTickers(data.tickers);
        setKimchi(data.kimchi);
      }
    });
    const request = () => port.postMessage({ type: 'watch', exchanges, keys });
    request();
    const timer = setInterval(request, REFRESH_MS);
    return () => {
      clearInterval(timer);
      port.disconnect();
    };
  }, [items]);

  const openPip = useCallback(async () => {
    if (!documentPip || !contentRef.current) return;
    const pip = await documentPip.requestWindow({ width: 260, height: Math.min(80 + items.length * 34, 460) });
    const stopSync = copyDocumentLook(pip.document);
    pip.document.body.className = document.body.className;
    pip.document.body.append(contentRef.current);
    setPipWindow(pip);
    pip.addEventListener('pagehide', () => {
      stopSync();
      if (contentRef.current) homeRef.current?.append(contentRef.current);
      setPipWindow(null);
    });
  }, [items.length]);

  const rows = items.map(item => {
    const key = `${item.exchange}:${item.market}`;
    const ticker = tickers[key];
    const premium = isKrwExchange(item.exchange) ? kimchi[key]?.premium : undefined;
    const name = language === 'ko' && ticker?.koreanName ? ticker.koreanName : coinOf(item.market);
    const rate = ticker?.changeRate ?? 0;
    return (
      <li key={key} data-testid="mini-row" className="flex items-center gap-1.5 px-2 py-1.5 border-b border-stroke-weak last:border-0">
        <img src={EXCHANGES[item.exchange].logo} alt={t(EXCHANGES[item.exchange].labelKey)} className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-cap font-semibold" title={item.market}>
          {name}
        </span>
        <span className="flex flex-col items-end">
          <span className="num text-cap font-medium">{ticker ? formatPrice(ticker.currentPrice, item.market) : '-'}</span>
          <span className="flex gap-1 text-cap-s">
            {premium !== undefined && (
              <span className="text-fg-subtle" title={t('kimchiColumnHint')}>
                {t('kimchiShort')} {premium >= 0 ? '+' : ''}
                {premium.toFixed(1)}%
              </span>
            )}
            <span className={rate > 0 ? 'text-up' : rate < 0 ? 'text-down' : 'text-fg-subtle'}>
              {rate > 0 ? '+' : ''}
              {rate.toFixed(2)}%
            </span>
          </span>
        </span>
      </li>
    );
  });

  return (
    <ThemeProvider defaultTheme="system" storageKey="como-ui-theme">
      <div ref={homeRef} className="min-h-screen bg-background text-foreground">
        {pipWindow && (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-cap text-fg-subtle">
            <p>{t('miniPipActive')}</p>
            <Button variant="soft" className="h-control gap-1 text-cap hover:cursor-pointer" onClick={() => pipWindow.close()}>
              <Undo2 className="size-3" />
              {t('miniPipReturn')}
            </Button>
          </div>
        )}
        <div ref={contentRef} className="bg-background text-foreground">
          <header className="flex items-center justify-between px-2 py-1 border-b border-stroke-weak">
            <span className="flex items-center gap-1 text-cap font-semibold">
              <img src={comoLogo} className="size-3.5" alt="" />
              {t('miniWindow')}
            </span>
            {documentPip && !pipWindow && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 hover:cursor-pointer"
                aria-label={t('miniPipOpen')}
                title={t('miniPipOpen')}
                onClick={openPip}>
                <PictureInPicture2 className="size-3.5" />
              </Button>
            )}
          </header>
          <ul>{rows}</ul>
          {favorites && !Object.values(favorites).some(list => list?.length) && (
            <p className="px-2 py-2 text-cap-s text-fg-faint">{t('miniEmptyHint')}</p>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
};
