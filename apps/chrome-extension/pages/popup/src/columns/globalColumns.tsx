import { ColumnDef, SortingState } from '@tanstack/react-table';
import { getTimeframes, Translate } from '@/i18n';
import { BinanceTicker, FavoriteCoins, GlobalExchange, MarketType } from '@/types';
import { getGlobalTradeUrl, splitGlobalSymbol } from '@/constants/exchanges';
import type { DisplayCurrency } from '@/i18n';
import { convertFiat, FiatRates, formatFiat } from '@/lib/market';
import { Star, ArrowDownUp, ChevronsUpDown, ChartCandlestick } from 'lucide-react';
import FlashCell from '@/components/FlashCell';
import ChartToolTip from '@/components/ChartToolTip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

import { ChevronDown } from 'lucide-react';

// 바이낸스·Bybit·OKX 공통 컬럼. 백그라운드가 세 거래소 시세를 바이낸스 필드 형태로 맞춰 보낸다.
export const getGlobalColumns = (
  exchange: GlobalExchange,
  exchangeMarketType: MarketType,
  favoriteCoins: FavoriteCoins,
  setFavoriteCoins: React.Dispatch<React.SetStateAction<FavoriteCoins>>,
  favoriteFunc: boolean,
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>,
  wideSize: boolean,
  timeframe: string,
  setTimeframe: (value: string) => void,
  t: Translate,
  displayCurrency: DisplayCurrency,
  exchangeRateUSD: number,
  fiatRates: FiatRates,
): ColumnDef<BinanceTicker>[] => [
  {
    accessorFn: row => `${row.symbol}`,
    id: 'market',
    header: () => (
      <div
        className="flex"
        onClick={() => {
          setSorting((prev: SortingState) => [{ id: 'market', desc: prev[0]?.desc ? false : true }]);
        }}>
        <a href="#" className="mr-[2px] font-bold">
          {t('name')}
        </a>
        <ArrowDownUp size={10} strokeWidth={3} className="mt-[2px]" />
      </div>
    ),
    cell: ({ row }) => {
      const symbol = row.original.symbol;
      const removeMarket = splitGlobalSymbol(symbol).base;

      const tradeURL = getGlobalTradeUrl(exchange, symbol);
      const savedCoins = favoriteCoins?.[exchange]?.join(',') || '';

      const toggleFavorite = () => {
        if (!row.getCanPin()) return; // 고정 불가능 시 무시
        setFavoriteCoins(prev => {
          const updated = { ...prev };
          if (savedCoins.includes(symbol)) {
            updated[exchange] = updated[exchange].filter(coin => coin !== symbol);
            row.pin(false); // 고정 해제
          } else {
            updated[exchange] = [...updated[exchange], symbol];
            row.pin('top'); // 상단 고정
          }
          return updated;
        });
      };

      return (
        <div className="flex gap-[2px] font-semibold">
          {favoriteFunc && (
            <div className="mt-[2px]">
              <Star
                className={
                  row.getIsPinned()
                    ? 'size-3 text-yellow-400 fill-yellow-400 hover:cursor-pointer'
                    : 'size-3 text-fg-faint hover:cursor-pointer hover:text-yellow-400 hover:fill-yellow-400'
                }
                onClick={toggleFavorite}
              />
            </div>
          )}
          <div className="text-left">
            <div className="flex gap-[2px]">
              <a href={tradeURL} target="_blank" className="hover:text-fg-faint">
                {removeMarket}
              </a>
            </div>
            <span className="text-cap text-fg-subtle font-medium">{symbol}</span>
          </div>
        </div>
      );
    },
    filterFn: (row, _columnId, filterValue) => {
      const searchValue = filterValue.toLowerCase().trim();
      if (!filterValue) return true;
      const removeMarket = splitGlobalSymbol(row.original.symbol).base.toLowerCase();
      const fullTextMatch = removeMarket.includes(searchValue);
      return fullTextMatch;
    },
    enableHiding: false,
    size: 103,
  },
  {
    accessorKey: 'candlestick_chart',
    header: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-5 w-12 text-cap-s font-semibold gap-1 hover:cursor-pointer">
            <span>{getTimeframes(t).find(tf => tf.value === timeframe)?.label}</span>
            <ChevronDown className="size-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="relative left-1 w-13 data-[side=bottom]:slide-in-from-top-2 z-52">
          <DropdownMenuGroup>
            {getTimeframes(t).map(({ value, label }) => (
              <DropdownMenuItem
                key={value}
                textValue={label}
                className="gap-1 px-1 py-1 items-left text-body-s hover:cursor-pointer"
                onSelect={() => setTimeframe(value)}>
                <span>{label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    cell: ({ row }) => {
      return (
        <div className="flex justify-center items-center">
          <ChartToolTip
            className="flex justify-center items-center hover:text-red-500"
            symbol={row.original.symbol}
            exchange={exchange}
            wideSize={wideSize}
            timeframe={timeframe}>
            <ChartCandlestick size={16} />
          </ChartToolTip>
        </div>
      );
    },
    enableHiding: false,
    size: 60,
  },
  {
    accessorFn: row => (row.c ? row.c : row.lastPrice),
    id: 'trade_price',
    header: ({ column }) => (
      <div className="flex justify-end" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span className="text-cap-s font-bold underline-offset-2">{t('currentPrice')}</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row, cell }) => {
      const lastPrice = Number(getValue() as string);
      const bidPrice = row.original.b || '0';
      const bidAskStatus = Number(lastPrice) <= Number(bidPrice) ? 'BID' : 'ASK';
      // USDT 가격 아래에 표시 통화(USD가 아닐 때) 환산값을 보여준다.
      // 호가 통화: USDT·USD는 달러, INR은 루피. 표시 통화와 다르면 아래에 환산값을 보여준다.
      const quoteCurrency = exchangeMarketType === 'INR' ? 'INR' : 'USD';
      const secondaryValue =
        exchangeMarketType === 'BTC' || displayCurrency === quoteCurrency
          ? null
          : convertFiat(lastPrice, quoteCurrency, displayCurrency, { exchangeRateUSD, fiatRates });
      const formattedPrice =
        lastPrice >= 1
          ? lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : String(lastPrice).replace(/\.?0+$/, '');

      return (
        <FlashCell
          key={cell.id}
          flashKey={cell.id}
          bidAskStatus={bidAskStatus ? bidAskStatus : ''}
          className={'flex flex-col items-end font-medium'}>
          <span>
            {exchangeMarketType === 'BTC'
              ? lastPrice.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })
              : `${exchangeMarketType === 'INR' ? '₹' : '$'}${formattedPrice.includes('e') ? lastPrice.toFixed(8) : formattedPrice}`}
          </span>
          {exchangeMarketType !== 'BTC' && secondaryValue !== null && (
            <span className="text-cap-s text-fg-subtle">
              {formatFiat(secondaryValue, displayCurrency, t('numberLocale'))}
            </span>
          )}
        </FlashCell>
      );
    },
    enableHiding: false,
  },
  {
    accessorFn: row => (row.P ? (row.P as string) : (row.priceChangePercent as string)),
    id: 'signed_change_rate',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <p>{t('change')}</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ row, getValue }) => {
      const value = Number(getValue());
      const priceChange = Number(row.original.priceChange);
      const formattedPriceChange = row.original.priceChange?.replace(/\.?0+$/, '');

      return (
        <div className="flex flex-col items-end font-medium">
          <span className={`${priceChange > 0 ? 'text-up' : priceChange < 0 ? 'text-down' : ''}`}>
            {`${value > 0 ? '+' : ''}${value.toFixed(2)}`}%
          </span>
          {exchangeMarketType !== 'BTC' && (
            <span className="text-cap-s text-fg-subtle">
              {formattedPriceChange.includes('e') ? priceChange.toFixed(8) : formattedPriceChange}
            </span>
          )}
        </div>
      );
    },
    enableHiding: false,
  },
  {
    accessorFn: row => {
      if (row.h) {
        return ((Number(row.c) - Number(row.h)) / Number(row.h)) * 100;
      } else if (row.highPrice) {
        return ((Number(row.lastPrice) - Number(row.highPrice)) / Number(row.highPrice)) * 100;
      }
    },
    id: 'highest_24h_diff',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span>{t('fromHigh24h')}</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = Number(getValue());
      const highestPrice = row.original.h ? Number(row.original.h) : Number(row.original.highPrice);
      return (
        <div
          className={`flex flex-col items-end ${value < 0 ? 'text-down' : value > 0 ? 'text-up' : 'text-black-500'} font-medium`}>
          <span>{value.toFixed(2)}%</span>
          {exchangeMarketType !== 'BTC' ? (
            <span className="text-cap-s text-fg-subtle">
              {highestPrice > 1 ? highestPrice?.toFixed(2) : String(highestPrice).replace(/\.?0+$/, '')}
            </span>
          ) : (
            <span className="text-cap-s text-fg-subtle">{Number(highestPrice)?.toFixed(8)}</span>
          )}
        </div>
      );
    },
  },
  {
    accessorFn: row => {
      if (row.l) {
        return ((Number(row.c) - Number(row.l)) / Number(row.l)) * 100;
      } else if (row.lowPrice) {
        return ((Number(row.lastPrice) - Number(row.lowPrice)) / Number(row.lowPrice)) * 100;
      }
    },
    id: 'lowest_24h_diff',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <p>{t('fromLow24h')}</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = Number(getValue());
      const lowestPrice = row.original.l ? Number(row.original.l) : Number(row.original.lowPrice);
      return (
        <div
          className={`flex flex-col items-end ${value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-black-500'} font-medium`}>
          <span>+{value.toFixed(2)}%</span>
          {exchangeMarketType !== 'BTC' ? (
            <span className="text-cap-s text-fg-subtle">
              {lowestPrice > 1 ? lowestPrice?.toFixed(2) : String(lowestPrice).replace(/\.?0+$/, '')}
            </span>
          ) : (
            <span className="text-cap-s text-fg-subtle">{lowestPrice?.toFixed(8)}</span>
          )}
        </div>
      );
    },
  },

  {
    accessorFn: row => (row.q ? (row.q as string) : (row.quoteVolume as string)),
    id: 'acc_trade_price_24h',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span>{t('volume')}</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue }) => {
      const value = Number(getValue());
      const formatCurrencyUS = (value: number) => {
        return new Intl.NumberFormat(exchangeMarketType === 'INR' ? 'en-IN' : 'en-US', {
          style: 'currency',
          currency: exchangeMarketType === 'INR' ? 'INR' : 'USD',
          notation: 'compact', // K, M, B 단위로 축약
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      };

      switch (exchangeMarketType) {
        case 'USDT':
        case 'USD':
        case 'INR':
          return (
            <div className="flex flex-col items-end font-medium p-2">
              <span>{formatCurrencyUS(value)}</span>
            </div>
          );
        case 'BTC':
          return (
            <div className="flex justify-end font-medium p-2">
              <span>{value >= 1 ? value.toFixed(2) : value.toFixed(5)}</span>
            </div>
          );
      }
    },
    enableHiding: false,
  },
];
