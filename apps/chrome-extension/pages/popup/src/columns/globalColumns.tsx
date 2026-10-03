import { ColumnDef, SortingState } from '@tanstack/react-table';
import { getTimeframes, Translate } from '@/i18n';
import { BinanceTicker, FavoriteCoins, GlobalExchange, MarketType } from '@/types';
import { getGlobalTradeUrl, splitGlobalSymbol } from '@/constants/exchanges';
import type { DisplayCurrency } from '@/i18n';
import { convertFiat, FiatRates, formatFiat } from '@/lib/market';
import { ArrowDownUp, ChartCandlestick } from 'lucide-react';
import { FavoriteStar, SortableHeader } from './shared';
import { toggleFavoriteCoin } from './favorites';
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
import { getNumberFormat } from '@/lib/format';

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
      <button
        type="button"
        className="flex font-bold hover:cursor-pointer"
        onClick={() => {
          setSorting((prev: SortingState) => [{ id: 'market', desc: prev[0]?.desc ? false : true }]);
        }}>
        <span className="mr-[2px]">{t('name')}</span>
        <ArrowDownUp size={10} strokeWidth={3} className="mt-[2px]" aria-hidden />
      </button>
    ),
    cell: ({ row }) => {
      const symbol = row.original.symbol;
      const removeMarket = splitGlobalSymbol(symbol).base;

      const tradeURL = getGlobalTradeUrl(exchange, symbol);
      const toggleFavorite = () =>
        toggleFavoriteCoin({ row, exchange: exchange, market: symbol, favoriteCoins, setFavoriteCoins });

      return (
        <div className="flex min-w-0 gap-[2px] font-semibold">
          {favoriteFunc && (
            <FavoriteStar pinned={row.getIsPinned() !== false} onToggle={toggleFavorite} label={t('favoritePin')} />
          )}
          <div className="min-w-0 text-left">
            <div className="flex min-w-0 gap-[2px]">
              <a href={tradeURL} target="_blank" title={removeMarket} className="truncate hover:text-fg-faint">
                {removeMarket}
              </a>
            </div>
            <span className="block truncate text-cap text-fg-subtle font-medium">{symbol}</span>
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
            className="flex justify-center items-center hover:text-fg-highlight"
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
    // 거래소 API 값은 문자열이라 숫자로 바꿔 정렬한다.
    accessorFn: row => Number(row.c ? row.c : row.lastPrice),
    id: 'trade_price',
    header: ({ column }) => (
      <SortableHeader column={column} label={t('currentPrice')} />
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
          className={'flex flex-col items-end font-medium whitespace-nowrap'}>
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
    accessorFn: row => Number(row.P ? row.P : row.priceChangePercent),
    id: 'signed_change_rate',
    header: ({ column }) => (
      <SortableHeader column={column} label={t('change')} />
    ),
    cell: ({ row, getValue }) => {
      const value = Number(getValue());
      const priceChange = Number(row.original.priceChange);
      const formattedPriceChange = row.original.priceChange?.replace(/\.?0+$/, '');

      return (
        <div className="flex flex-col items-end font-medium whitespace-nowrap">
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
      <SortableHeader column={column} label={t('fromHigh24h')} />
    ),
    cell: ({ getValue, row }) => {
      const value = Number(getValue());
      const highestPrice = row.original.h ? Number(row.original.h) : Number(row.original.highPrice);
      return (
        <div
          className={`flex flex-col items-end ${value < 0 ? 'text-down' : value > 0 ? 'text-up' : 'text-fg-neutral'} font-medium`}>
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
      <SortableHeader column={column} label={t('fromLow24h')} />
    ),
    cell: ({ getValue, row }) => {
      const value = Number(getValue());
      const lowestPrice = row.original.l ? Number(row.original.l) : Number(row.original.lowPrice);
      return (
        <div
          className={`flex flex-col items-end ${value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-fg-neutral'} font-medium`}>
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
    accessorFn: row => Number(row.q ? row.q : row.quoteVolume),
    id: 'acc_trade_price_24h',
    header: ({ column }) => (
      <SortableHeader column={column} label={t('volume')} />
    ),
    cell: ({ getValue }) => {
      const value = Number(getValue());
      const formatCurrencyUS = (value: number) => {
        return getNumberFormat(exchangeMarketType === 'INR' ? 'en-IN' : 'en-US', {
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
            <div className="flex flex-col items-end font-medium p-2 whitespace-nowrap">
              <span>{formatCurrencyUS(value)}</span>
            </div>
          );
        case 'BTC':
          return (
            <div className="flex justify-end font-medium p-2 whitespace-nowrap">
              <span>{value >= 1 ? value.toFixed(2) : value.toFixed(5)}</span>
            </div>
          );
      }
    },
    enableHiding: false,
  },
];
