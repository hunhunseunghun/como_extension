import { useEffect, useState } from 'react';
import { Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MarketPicker } from '@/components/MarketPicker';
import { CurrencySelect } from '@/components/SettingsPopover';
import { EXCHANGES, isGlobalExchange, splitGlobalSymbol } from '@/constants/exchanges';
import { useAllTickers } from '@/hooks/useAllTickers';
import { useI18n } from '@/i18n';
import { convertFiat, formatFiat, useMarket } from '@/lib/market';
import { ExchangePlatform } from '@/types';
import { ShareButton } from '@/components/ShareButton';
import { AccountSync, type SyncExchange, type SyncedHolding } from '@/components/AccountSync';
import { HoverHint } from '@/components/ui/hoverHint';
import { IconButton } from '@/components/ui/iconButton';

// source: 거래소 API로 불러온 항목('upbit-api' 등). 다시 동기화하면 같은 source 항목만 바꾼다.
type Holding = {
  id: string;
  exchange: ExchangePlatform;
  market: string;
  quantity: number;
  avgPrice: number;
  source?: string;
};
type Quote = 'KRW' | 'USD' | 'INR';

const STORAGE_KEY = 'portfolio';

// KRW 마켓은 원화, USDT·USD 마켓은 달러(USDT≈USD)로 본다. BTC 마켓은 지원하지 않는다.
const getQuote = (market: string): Quote | null =>
  market.startsWith('KRW-')
    ? 'KRW'
    : market.endsWith('USDT') || market.endsWith('USD')
      ? 'USD'
      : market.endsWith('INR')
        ? 'INR'
        : null;

const getCoin = (exchange: ExchangePlatform, market: string) =>
  isGlobalExchange(exchange) ? splitGlobalSymbol(market).base : (market.split('-')[1] ?? market);

const formatPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const pnlColor = (value: number) => (value > 0 ? 'text-up' : value < 0 ? 'text-down' : '');

export const PortfolioPopover = () => {
  const { t, currency } = useI18n();
  const market = useMarket();
  const [isOpen, setIsOpen] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const prices = useAllTickers(isOpen);
  const [exchange, setExchange] = useState<ExchangePlatform>('upbit');
  const [marketInput, setMarketInput] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const locale = t('numberLocale');

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, result => {
      if (Array.isArray(result?.[STORAGE_KEY])) setHoldings(result[STORAGE_KEY]);
    });
  }, []);

  const saveHoldings = (next: Holding[]) => {
    setHoldings(next);
    chrome.storage.local.set({ [STORAGE_KEY]: next });
  };

  const normalizedMarket = marketInput.trim().toUpperCase();
  const selectedPrice = prices[`${exchange}:${normalizedMarket}`]?.currentPrice;
  const convert = (value: number, from: Quote) => convertFiat(value, from, currency, market);

  const rows = holdings.map(holding => {
    const quote = getQuote(holding.market) ?? 'USD';
    const price = prices[`${holding.exchange}:${holding.market}`]?.currentPrice;
    const value = price ? price * holding.quantity : null;
    const cost = holding.avgPrice * holding.quantity;
    const pnl = value !== null ? value - cost : null;
    return { holding, quote, price, value, cost, pnl, pnlRate: pnl !== null && cost > 0 ? (pnl / cost) * 100 : null };
  });

  const totals = rows.reduce(
    (acc, row) => {
      const value = row.value !== null ? convert(row.value, row.quote) : null;
      const cost = convert(row.cost, row.quote);
      if (value === null || cost === null) return { ...acc, incomplete: true };
      return { ...acc, value: acc.value + value, cost: acc.cost + cost };
    },
    { value: 0, cost: 0, incomplete: false },
  );
  const totalPnl = totals.value - totals.cost;

  const handleSynced = (syncExchange: SyncExchange, synced: SyncedHolding[]) => {
    const source = `${syncExchange}-api`;
    saveHoldings([
      ...holdings.filter(holding => holding.source !== source),
      ...synced.map(({ avgEstimated, ...item }, index) => {
        // 평균가를 주지 않는 거래소(바이낸스)는 다시 불러올 때 이전 평균가를 지킨다. 그러지 않으면 매번 손익이 0이 된다.
        const previous = avgEstimated
          ? holdings.find(holding => holding.source === source && holding.market === item.market)
          : undefined;
        return {
          id: `${source}-${Date.now()}-${index}`,
          exchange: syncExchange,
          ...item,
          avgPrice: previous?.avgPrice ?? item.avgPrice,
          source,
        };
      }),
    ]);
  };

  // 평균가 직접 고치기. 거래소가 평균가를 주지 않거나(바이낸스) 잘못 입력했을 때 쓴다.
  const commitAvgPrice = (id: string) => {
    const next = Number(editValue);
    setEditingId(null);
    if (!(next > 0)) return;
    saveHoldings(holdings.map(holding => (holding.id === id ? { ...holding, avgPrice: next } : holding)));
  };

  const handleAdd = () => {
    const qty = Number(quantity);
    const avg = avgPrice.trim() ? Number(avgPrice) : selectedPrice;
    if (!selectedPrice || !getQuote(normalizedMarket) || !(qty > 0) || !avg || !(avg > 0)) {
      setErrorMessage(t('portfolioInvalid'));
      return;
    }
    setErrorMessage('');
    saveHoldings([
      ...holdings,
      { id: `${Date.now()}`, exchange, market: normalizedMarket, quantity: qty, avgPrice: avg },
    ]);
    setMarketInput('');
    setQuantity('');
    setAvgPrice('');
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative group">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('portfolio')}
            className="relative w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Wallet strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
          </Button>
          <HoverHint>
            {t('portfolio')}
          </HoverHint>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-2 text-cap bg-background border border-stroke-weak"
        onEscapeKeyDown={event => {
          if ((event.target as HTMLElement | null)?.closest?.('[data-editing="true"]')) event.preventDefault();
        }}>
        <div className="flex justify-between items-center mb-1 px-1">
          <span className="text-title-s font-semibold">{t('portfolio')}</span>
          <CurrencySelect />
        </div>

        <div className="rounded-md border border-tile-border bg-tile px-2 py-1.5 mb-2" data-testid="portfolio-total">
          <div className="flex justify-between items-baseline">
            <span className="text-fg-subtle">{t('totalValue')}</span>
            <span className="num text-(length:--como-text-total) font-semibold">{formatFiat(totals.value, currency, locale)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-subtle">{t('totalPnl')}</span>
            <span className={`num font-semibold ${pnlColor(totalPnl)}`}>
              {formatFiat(totalPnl, currency, locale)}
              {totals.cost > 0 && ` (${formatPercent((totalPnl / totals.cost) * 100)})`}
            </span>
          </div>
          {totals.incomplete && <div className="text-cap-s text-fg-faint">{t('portfolioIncomplete')}</div>}
          <div className="flex justify-end">
            <ShareButton
              disabled={!rows.length || totals.cost <= 0}
              build={() => {
                const rate = (totalPnl / totals.cost) * 100;
                return {
                  title: t('sharePortfolioTitle'),
                  headline: formatPercent(rate),
                  headlineTone: rate > 0 ? 'up' : rate < 0 ? 'down' : 'neutral',
                  lines: [...rows]
                    .sort((a, b) => (b.pnlRate ?? 0) - (a.pnlRate ?? 0))
                    .slice(0, 4)
                    .map(row => ({
                      label: getCoin(row.holding.exchange, row.holding.market),
                      value: row.pnlRate != null ? formatPercent(row.pnlRate) : '-',
                      tone: (row.pnlRate ?? 0) > 0 ? 'up' : (row.pnlRate ?? 0) < 0 ? 'down' : 'neutral',
                    })),
                };
              }}
            />
          </div>
        </div>

        <MarketPicker
          className="mb-1"
          exchange={exchange}
          onExchangeChange={setExchange}
          market={marketInput}
          onMarketChange={setMarketInput}
          prices={prices}
          filter={value => getQuote(value) !== null}
        />
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1 mb-1">
          <Input
            type="number"
            min="0"
            className="h-control px-2 text-cap-s"
            placeholder={t('quantity')}
            value={quantity}
            onChange={event => setQuantity(event.target.value)}
          />
          <Input
            type="number"
            min="0"
            className="h-control px-2 text-cap-s"
            placeholder={selectedPrice ? String(selectedPrice) : t('avgPrice')}
            title={t('avgPrice')}
            value={avgPrice}
            onChange={event => setAvgPrice(event.target.value)}
          />
          <Button className="h-control px-3 text-cap-s hover:cursor-pointer" onClick={handleAdd}>
            {t('add')}
          </Button>
        </div>
        {errorMessage && <div className="text-fg-critical text-cap-s mb-1">{errorMessage}</div>}

        <div className="max-h-48 overflow-y-auto">
          {!rows.length && <div className="text-fg-faint py-2">{t('noHoldings')}</div>}
          {rows.map(({ holding, quote, price, value, pnl, pnlRate }) => (
            <div
              key={holding.id}
              className="flex items-center gap-1 py-1 border-b last:border-b-0"
              data-testid="holding">
              <img src={EXCHANGES[holding.exchange]?.logo} className="size-3.5" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  {getCoin(holding.exchange, holding.market)}{' '}
                  <span className="text-fg-faint font-normal">× {holding.quantity}</span>
                  {holding.source && (
                    <span className="ml-1 rounded-sm bg-neutral-weak px-1 text-cap-xs font-normal">API</span>
                  )}
                </div>
                {editingId === holding.id ? (
                  <Input
                    type="number"
                    min="0"
                    autoFocus
                    data-editing="true"
                    aria-label={t('avgPrice')}
                    className="h-5 px-1 text-cap-s"
                    value={editValue}
                    onChange={event => setEditValue(event.target.value)}
                    onBlur={() => commitAvgPrice(holding.id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') commitAvgPrice(holding.id);
                      // Esc는 편집만 취소한다(팝오버는 onEscapeKeyDown에서 닫지 않음).
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="num block max-w-full text-left text-cap-s text-fg-faint truncate hover:cursor-pointer hover:text-fg-subtle"
                    title={t('editAvgPrice')}
                    onClick={() => {
                      setEditingId(holding.id);
                      setEditValue(String(holding.avgPrice));
                    }}>
                    {t('avgPrice')} {formatFiat(holding.avgPrice, quote, locale)} ·{' '}
                    {price ? formatFiat(price, quote, locale) : '-'}
                  </button>
                )}
              </div>
              <div className="num text-right">
                <div>{value !== null ? formatFiat(value, quote, locale) : '-'}</div>
                <div className={`text-cap-s ${pnl !== null ? pnlColor(pnl) : ''}`}>
                  {pnl !== null && pnlRate !== null
                    ? `${formatFiat(pnl, quote, locale)} (${formatPercent(pnlRate)})`
                    : '-'}
                </div>
              </div>
              <IconButton
                aria-label={t('delete')}
                onClick={() => saveHoldings(holdings.filter(item => item.id !== holding.id))}>
                <X />
              </IconButton>
            </div>
          ))}
        </div>
        <AccountSync onSynced={handleSynced} />
      </PopoverContent>
    </Popover>
  );
};
