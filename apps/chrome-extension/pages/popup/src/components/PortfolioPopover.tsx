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

type Holding = { id: string; exchange: ExchangePlatform; market: string; quantity: number; avgPrice: number };
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
          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white font-semibold bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[50]">
            {t('portfolio')}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 text-[11px] bg-background dark:bg-background border border-neutral-200 dark:border-neutral-800">
        <div className="flex justify-between items-center mb-1">
          <span className="font-semibold">{t('portfolio')}</span>
          <CurrencySelect />
        </div>

        <div className="rounded-md border p-1.5 mb-2" data-testid="portfolio-total">
          <div className="flex justify-between">
            <span className="text-neutral-500">{t('totalValue')}</span>
            <span className="font-semibold">{formatFiat(totals.value, currency, locale)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">{t('totalPnl')}</span>
            <span className={`font-semibold ${pnlColor(totalPnl)}`}>
              {formatFiat(totalPnl, currency, locale)}
              {totals.cost > 0 && ` (${formatPercent((totalPnl / totals.cost) * 100)})`}
            </span>
          </div>
          {totals.incomplete && <div className="text-[10px] text-neutral-400">{t('portfolioIncomplete')}</div>}
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
            className="h-6 px-1 text-[10px]"
            placeholder={t('quantity')}
            value={quantity}
            onChange={event => setQuantity(event.target.value)}
          />
          <Input
            type="number"
            min="0"
            className="h-6 px-1 text-[10px]"
            placeholder={selectedPrice ? String(selectedPrice) : t('avgPrice')}
            title={t('avgPrice')}
            value={avgPrice}
            onChange={event => setAvgPrice(event.target.value)}
          />
          <Button className="h-6 px-2 text-[10px] hover:cursor-pointer" onClick={handleAdd}>
            {t('add')}
          </Button>
        </div>
        {errorMessage && <div className="text-red-500 text-[10px] mb-1">{errorMessage}</div>}

        <div className="max-h-48 overflow-y-auto">
          {!rows.length && <div className="text-neutral-400 py-2">{t('noHoldings')}</div>}
          {rows.map(({ holding, quote, price, value, pnl, pnlRate }) => (
            <div
              key={holding.id}
              className="flex items-center gap-1 py-1 border-b last:border-b-0"
              data-testid="holding">
              <img src={EXCHANGES[holding.exchange]?.logo} className="size-3" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  {getCoin(holding.exchange, holding.market)}{' '}
                  <span className="text-neutral-400 font-normal">× {holding.quantity}</span>
                </div>
                <div className="text-[10px] text-neutral-400 truncate">
                  {t('avgPrice')} {formatFiat(holding.avgPrice, quote, locale)} ·{' '}
                  {price ? formatFiat(price, quote, locale) : '-'}
                </div>
              </div>
              <div className="text-right">
                <div>{value !== null ? formatFiat(value, quote, locale) : '-'}</div>
                <div className={`text-[10px] ${pnl !== null ? pnlColor(pnl) : ''}`}>
                  {pnl !== null && pnlRate !== null
                    ? `${formatFiat(pnl, quote, locale)} (${formatPercent(pnlRate)})`
                    : '-'}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('delete')}
                className="h-4 w-4 p-0 hover:bg-transparent hover:cursor-pointer"
                onClick={() => saveHoldings(holdings.filter(item => item.id !== holding.id))}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
