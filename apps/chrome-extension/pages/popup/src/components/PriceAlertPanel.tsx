import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { getRegExp } from 'korean-regexp';
import { Button } from '@/components/ui/button';
import { Command as CommandPrimitive } from 'cmdk';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { ExchangeChip } from '@/components/ui/exchangeChip';
import { IconButton } from '@/components/ui/iconButton';
import { Segmented } from '@/components/ui/segmented';
import { EXCHANGES, EXCHANGE_LIST, MARKET_TYPES, isGlobalExchange, splitGlobalSymbol } from '@/constants/exchanges';
import { useAllTickers, type TickerPrice } from '@/hooks/useAllTickers';
import { useI18n } from '@/i18n';
import type { ExchangePlatform } from '@/types';

// 백그라운드(setPriceAlert·deletePriceAlert)와 같은 저장 형식: priceAlerts[exchange][market] = [{ price, deadband, once? }]
// once: 한 번 울리면 백그라운드가 지운다.
type PricePair = { price: number; deadband: number; once?: boolean };
type PriceAlerts = Record<string, Record<string, PricePair[]>>;

const MAX_RESULTS = 80;
const QUICK_STEPS = [-5, -1, 0, 1, 5] as const;
const DEADBAND_PRESETS = ['once', '0', '1', '3', '5', '10'] as const;
type DeadbandPreset = (typeof DEADBAND_PRESETS)[number];

// 가격 크기에 맞춰 자릿수를 정한다: 큰 값은 소수 2자리, 1 미만은 유효숫자 6자리.
const formatPrice = (value: number) =>
  value >= 1000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : value >= 1
      ? value.toLocaleString('en-US', { maximumFractionDigits: 4 })
      : value.toLocaleString('en-US', { maximumSignificantDigits: 6 });
// 빠른 설정 값은 유효숫자 4자리로 맞춘다(113,937,120 → 113,900,000). 호가 단위와 비슷한 깔끔한 값이 된다.
const roundNice = (value: number) => {
  if (!(value > 0)) return value;
  const step = 10 ** (Math.floor(Math.log10(value)) - 3);
  return Number((Math.round(value / step) * step).toPrecision(12));
};
const parsePrice = (text: string) => {
  const value = Number(text.replace(/,/g, '').trim());
  return Number.isFinite(value) ? value : 0;
};
const formatPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

const coinOf = (exchange: string, market: string) =>
  isGlobalExchange(exchange as ExchangePlatform) ? splitGlobalSymbol(market).base : (market.split('-')[1] ?? market);
const marketFor = (exchange: ExchangePlatform, coin: string) => {
  const quote = MARKET_TYPES[exchange][0];
  return isGlobalExchange(exchange) ? `${coin}${quote}` : `${quote}-${coin}`;
};

// 코드·한글명·초성으로 찾고, 같거나 앞글자가 맞는 종목을 위로 올린다.
const searchTickers = (tickers: TickerPrice[], query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return tickers;
  const upper = trimmed.toUpperCase();
  let initials: RegExp | null = null;
  let initialsPrefix: RegExp | null = null;
  try {
    initials = getRegExp(trimmed, { initialSearch: true });
    initialsPrefix = getRegExp(trimmed, { initialSearch: true, startsWith: true });
  } catch {
    initials = null;
  }
  const ranked: { ticker: TickerPrice; rank: number; index: number }[] = [];
  tickers.forEach((ticker, index) => {
    const market = ticker.market.toUpperCase();
    const coin = coinOf(ticker.exchange, ticker.market).toUpperCase();
    const name = ticker.koreanName ?? '';
    if (!market.includes(upper) && !name.includes(trimmed) && !(name && initials?.test(name))) return;
    const rank =
      coin === upper || name === trimmed
        ? 0
        : coin.startsWith(upper) || name.startsWith(trimmed) || (!!name && !!initialsPrefix?.test(name))
          ? 1
          : 2;
    ranked.push({ ticker, rank, index });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map(({ ticker }) => ticker);
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="px-0.5 pb-1 text-cap-s font-semibold text-fg-subtle">{children}</div>
);

export const PriceAlertPanel = () => {
  const { language, t } = useI18n();
  const prices = useAllTickers(true);
  const [exchange, setExchange] = useState<ExchangePlatform>('upbit');
  const [market, setMarket] = useState('KRW-BTC');
  const [query, setQuery] = useState('');
  const [isListOpen, setIsListOpen] = useState(false);
  const [targetText, setTargetText] = useState('');
  const [deadband, setDeadband] = useState<DeadbandPreset>('5');
  const [alerts, setAlerts] = useState<PriceAlerts>({});
  const [errorMessage, setErrorMessage] = useState('');

  const selected = prices[`${exchange}:${market}`];
  const currentPrice = selected?.currentPrice ?? 0;
  const isLoading = Object.keys(prices).length === 0;

  // 백그라운드가 바꾼 목록(한 번 울린 알림 삭제 등)도 열려 있는 동안 따라간다.
  useEffect(() => {
    chrome.storage.local.get('priceAlerts', result => setAlerts((result?.priceAlerts as PriceAlerts) ?? {}));
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.priceAlerts) setAlerts((changes.priceAlerts.newValue as PriceAlerts) ?? {});
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // 종목을 처음 받거나 바꾸면 목표가를 현재가로 채운다.
  useEffect(() => {
    if (currentPrice && !targetText) setTargetText(formatPrice(currentPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  const exchangeTickers = useMemo(
    () => Object.values(prices).filter(ticker => ticker.exchange === exchange && ticker.currentPrice > 0),
    [prices, exchange],
  );
  const results = useMemo(() => searchTickers(exchangeTickers, query).slice(0, MAX_RESULTS), [exchangeTickers, query]);

  const selectMarket = (nextExchange: ExchangePlatform, nextMarket: string) => {
    setExchange(nextExchange);
    setMarket(nextMarket);
    setQuery('');
    setIsListOpen(false);
    setErrorMessage('');
    const price = prices[`${nextExchange}:${nextMarket}`]?.currentPrice;
    setTargetText(price ? formatPrice(price) : '');
  };

  // 거래소를 바꾸면 같은 코인을 그 거래소 기본 마켓에서 찾는다(BTC → BTCUSDT).
  const changeExchange = (next: ExchangePlatform) => {
    if (next === exchange) return;
    const candidate = marketFor(next, coinOf(exchange, market));
    selectMarket(next, prices[`${next}:${candidate}`] ? candidate : '');
  };

  const target = parsePrice(targetText);
  const diff = currentPrice && target ? ((target - currentPrice) / currentPrice) * 100 : null;

  const rows = useMemo(
    () =>
      Object.entries(alerts).flatMap(([alertExchange, markets]) =>
        Object.entries(markets ?? {}).flatMap(([alertMarket, pairs]) =>
          (Array.isArray(pairs) ? pairs : []).map(pair => ({ exchange: alertExchange, market: alertMarket, ...pair })),
        ),
      ),
    [alerts],
  );

  const refresh = () =>
    chrome.storage.local.get('priceAlerts', result => setAlerts((result?.priceAlerts as PriceAlerts) ?? {}));

  const addAlert = () => {
    if (!selected || !(target > 0)) {
      setErrorMessage(t('alertInvalid'));
      return;
    }
    if ((alerts[exchange]?.[market] ?? []).some(pair => pair.price === target)) {
      setErrorMessage(t('alertDuplicate'));
      return;
    }
    setErrorMessage('');
    const pair: PricePair =
      deadband === 'once' ? { price: target, deadband: 0, once: true } : { price: target, deadband: Number(deadband) / 100 };
    // 먼저 화면에 반영하고, 저장이 끝나면 저장된 값으로 맞춘다.
    setAlerts(prev => ({
      ...prev,
      [exchange]: { ...prev[exchange], [market]: [...(prev[exchange]?.[market] ?? []), pair] },
    }));
    chrome.runtime.sendMessage({ action: 'setPriceAlert', exchange, ticker: market, prices: [pair] }, refresh);
  };

  const removeAlert = (alertExchange: string, alertMarket: string, price: number) => {
    setAlerts(prev => ({
      ...prev,
      [alertExchange]: {
        ...prev[alertExchange],
        [alertMarket]: (prev[alertExchange]?.[alertMarket] ?? []).filter(pair => pair.price !== price),
      },
    }));
    chrome.runtime.sendMessage(
      { action: 'deletePriceAlert', exchange: alertExchange, ticker: alertMarket, price },
      refresh,
    );
  };

  const displayName = (ticker: TickerPrice) =>
    language === 'ko' && ticker.koreanName ? ticker.koreanName : coinOf(ticker.exchange, ticker.market);

  return (
    <div className="flex flex-col gap-2 text-cap" data-testid="price-alert">
      <section>
        <Label>{t('alertCoin')}</Label>
        <div className="mb-1 flex flex-wrap gap-0.5">
          {EXCHANGE_LIST.map(({ key, logo, labelKey }) => (
            <ExchangeChip
              key={key}
              logo={logo}
              label={t(labelKey)}
              selected={exchange === key}
              onClick={() => changeExchange(key)}
            />
          ))}
        </div>
        <Command shouldFilter={false} className="relative overflow-visible bg-transparent">
          <div className="flex h-control items-center gap-1 rounded-md border border-field-border bg-field px-2 shadow-(--como-field-shadow) focus-within:ring-2 focus-within:ring-(--como-field-focus)">
            <Search className="size-3 shrink-0 text-fg-subtle" />
            <CommandPrimitive.Input
              aria-label={t('alertCoin')}
              placeholder={t('searchPlaceholder')}
              className="h-full w-full bg-transparent text-cap-s text-fg-neutral outline-none placeholder:text-(--como-field-placeholder)"
              value={query}
              onValueChange={value => {
                setQuery(value);
                setIsListOpen(true);
              }}
              onFocus={() => setIsListOpen(true)}
              onBlur={() => setIsListOpen(false)}
              // 목록이 열려 있으면 Esc는 목록만 닫는다(PriceNotiPopover가 data-list-open을 보고 창 닫기를 막는다).
              data-list-open={isListOpen}
              onKeyDown={event => event.key === 'Escape' && setIsListOpen(false)}
            />
          </div>
          {isListOpen && (
            <CommandList className="absolute top-[calc(var(--como-control-h)+4px)] left-0 z-50 max-h-56 w-full overflow-y-auto rounded-md border border-stroke-weak bg-layer-floating p-1 shadow-md light-scrollbar dark-scrollbar">
              {isLoading ? (
                <CommandEmpty>{t('searching')}</CommandEmpty>
              ) : !results.length ? (
                <CommandEmpty>{t('noSearchResults')}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {results.map(ticker => (
                    <CommandItem
                      key={ticker.market}
                      value={ticker.market}
                      onMouseDown={event => event.preventDefault()}
                      onSelect={() => selectMarket(exchange, ticker.market)}
                      className="flex justify-between gap-2 text-cap-s hover:cursor-pointer">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{displayName(ticker)}</span>{' '}
                        <span className="text-fg-subtle">{ticker.market}</span>
                      </span>
                      <span className="num shrink-0 text-fg-muted">{formatPrice(ticker.currentPrice)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          )}
        </Command>
      </section>

      <div
        className="flex items-center gap-2 rounded-md border border-tile-border bg-tile px-2 py-1.5"
        data-testid="price-alert-selected">
        {selected ? (
          <>
            <img src={EXCHANGES[exchange].logo} alt="" className="size-4 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{displayName(selected)}</div>
              <div className="truncate text-cap-s text-fg-subtle">{selected.market}</div>
            </div>
            <div className="num text-right">
              <div className="font-semibold">{formatPrice(currentPrice)}</div>
              {selected.changeRate != null && (
                <div className={`text-cap-s ${selected.changeRate >= 0 ? 'text-up' : 'text-down'}`}>
                  {formatPercent(selected.changeRate)}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-1.5 text-fg-faint">{isLoading ? t('searching') : t('alertPickCoin')}</div>
        )}
      </div>

      <section>
        <Label>{t('targetPrice')}</Label>
        <input
          aria-label={t('targetPrice')}
          inputMode="decimal"
          value={targetText}
          onChange={event => {
            setTargetText(event.target.value.replace(/[^\d.,]/g, ''));
            setErrorMessage('');
          }}
          onBlur={() => target > 0 && setTargetText(formatPrice(target))}
          className="num h-control-lg w-full rounded-md border border-field-border bg-field px-2 text-right text-body font-semibold text-fg-neutral shadow-(--como-field-shadow) outline-none hover:bg-field-hover focus-visible:ring-2 focus-visible:ring-(--como-field-focus)"
        />
        <div className="mt-1 grid grid-cols-5 gap-0.5">
          {QUICK_STEPS.map(step => (
            <Button
              key={step}
              variant="soft"
              disabled={!currentPrice}
              className="num h-6 px-0 text-cap-s hover:cursor-pointer"
              onClick={() =>
                setTargetText(formatPrice(step === 0 ? currentPrice : roundNice(currentPrice * (1 + step / 100))))
              }>
              {step === 0 ? t('alertNowChip') : `${step > 0 ? '+' : ''}${step}%`}
            </Button>
          ))}
        </div>
        {diff !== null && Math.abs(diff) >= 0.005 && (
          <div className="mt-1 px-0.5 text-cap-s" data-testid="price-alert-direction">
            <span className={diff > 0 ? 'text-up' : 'text-down'}>
              {diff > 0 ? `▲ ${t('alertWhenUp')}` : `▼ ${t('alertWhenDown')}`}
            </span>
            <span className="text-fg-subtle"> · {t('alertVsCurrent').replace('{p}', formatPercent(diff))}</span>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <span className="px-0.5 text-cap-s font-semibold text-fg-subtle">{t('deadband')}</span>
          <Segmented
            value={deadband}
            onChange={setDeadband}
            options={DEADBAND_PRESETS.map(value => ({ value, label: value === 'once' ? t('alertOnce') : `${value}%` }))}
            itemClassName="num px-1.5 text-cap-s"
          />
        </div>
        <p className="mt-1 px-0.5 text-cap-s text-fg-faint">{t(deadband === 'once' ? 'alertOnceHint' : 'deadbandHint')}</p>
      </section>

      {errorMessage && <div className="px-0.5 text-cap-s text-fg-critical">{errorMessage}</div>}
      <Button className="h-control-lg text-cap hover:cursor-pointer" disabled={!selected} onClick={addAlert}>
        {t('addAlert')}
      </Button>

      <section className="border-t border-stroke-weak pt-2">
        <div className="flex items-center justify-between px-0.5 pb-1">
          <span className="text-cap-s font-semibold text-fg-subtle">{t('allAlerts')}</span>
          {!!rows.length && <span className="num text-cap-s text-fg-subtle">{rows.length}</span>}
        </div>
        {!rows.length ? (
          <div className="px-0.5 py-2 text-fg-faint">{t('noAlerts')}</div>
        ) : (
          <ul className="divide-y divide-stroke-weak">
            {rows.map(row => {
              const now = prices[`${row.exchange}:${row.market}`]?.currentPrice;
              const gap = now ? ((row.price - now) / now) * 100 : null;
              return (
                <li
                  key={`${row.exchange}:${row.market}:${row.price}`}
                  className="flex min-h-8 items-center gap-1.5 px-0.5"
                  data-testid="price-alert-row">
                  <img
                    src={EXCHANGES[row.exchange as ExchangePlatform]?.logo}
                    alt=""
                    className="size-3.5 rounded-full"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.market}</div>
                    <div className="num text-cap-s text-fg-subtle">
                      {row.once ? t('alertOnceHint') : `${t('deadband')} ±${(row.deadband * 100).toFixed(0)}%`}
                    </div>
                  </div>
                  <div className="num text-right">
                    <div className="font-semibold">
                      {gap !== null && (
                        <span className={gap >= 0 ? 'text-up' : 'text-down'}>{gap >= 0 ? '▲ ' : '▼ '}</span>
                      )}
                      {formatPrice(row.price)}
                    </div>
                    <div className="text-cap-s text-fg-subtle">{gap !== null ? formatPercent(gap) : '-'}</div>
                  </div>
                  <IconButton aria-label={t('delete')} onClick={() => removeAlert(row.exchange, row.market, row.price)}>
                    <X />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
