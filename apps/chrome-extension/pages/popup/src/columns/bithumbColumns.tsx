import { ColumnDef } from '@tanstack/react-table';
import { DisplayCurrency, getTimeframes, Translate } from '@/i18n';
import { convertFiat, FiatRates, formatFiat } from '@/lib/market';
import { BithumbTicker, FavoriteCoins, MarketType } from '@/types';
import { Star, ArrowRightLeft, ChevronsUpDown, ChartCandlestick } from 'lucide-react';
import { WarningIcon } from '@/components/ui/warningIcon';
import { getRegExp } from 'korean-regexp';
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

export const getBithumbColumns = (
  coinNameKR: boolean,
  setCoinNameKR: (value: boolean) => void,
  exchangeRateUSD: number,
  exchangeMarketType: MarketType,
  favoriteCoins: FavoriteCoins,
  setFavoriteCoins: React.Dispatch<React.SetStateAction<FavoriteCoins>>,
  favoriteFunc: boolean,
  wideSize: boolean,
  timeframe: string,
  setTimeframe: (value: string) => void,
  t: Translate,
  displayCurrency: DisplayCurrency,
  fiatRates: FiatRates,
): ColumnDef<BithumbTicker>[] => [
  {
    accessorFn: row => `${row.korean_name} ${row.market}`,
    id: 'market',
    header: () => (
      <div className="flex" onClick={() => setCoinNameKR(!coinNameKR)}>
        <a href="#" className="mr-[2px] font-bold">
          {coinNameKR ? t('nameKR') : t('nameEN')}
        </a>
        <ArrowRightLeft size={10} strokeWidth={3} className="mt-[2px]" />
      </div>
    ),
    cell: ({ row }) => {
      const splitMarket = row.original.market?.split('-');
      const bithumbRow = row.original as { market_warning?: 'NONE' | 'CAUTION' };
      const market = row.original.market;
      const savedCoins = favoriteCoins?.bithumb?.join(',') || '';

      const toggleFavorite = () => {
        if (!row.getCanPin()) return; // 고정 불가능 시 무시
        setFavoriteCoins(prev => {
          const updated = { ...prev };
          if (savedCoins.includes(market)) {
            updated.bithumb = updated.bithumb.filter(coin => coin !== market);
            row.pin(false); // 고정 해제
          } else {
            updated.bithumb = [...updated.bithumb, market];
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
              <a
                href={`https://www.bithumb.com/react/trade/order/${splitMarket.length && splitMarket[1] + '-' + splitMarket[0]}`}
                target="_blank"
                className="hover:text-fg-faint">
                {coinNameKR ? row.original.korean_name : row.original.english_name}
              </a>
              {bithumbRow.market_warning !== 'NONE' && <WarningIcon text={t('warningShort')} />}
            </div>
            <span className="text-cap text-fg-subtle font-medium">
              {splitMarket.length && splitMarket[1] + '/' + splitMarket[0]}
            </span>
          </div>
        </div>
      );
    },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      const market = row.original.market.toLowerCase();
      const englishName = row.original.english_name?.toLowerCase() || '';
      const koreanName = row.original.korean_name || '';
      const searchValue = filterValue.toLowerCase().trim();
      const fullTextMatch =
        market.includes(searchValue) || englishName.includes(searchValue) || koreanName.includes(searchValue);
      const chosungRegex = getRegExp(searchValue, { initialSearch: true });
      return fullTextMatch || chosungRegex.test(koreanName);
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
            symbol={row.original.market}
            exchange="bithumb"
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
    accessorKey: 'trade_price',
    header: ({ column }) => (
      <div className="flex justify-end" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span className="text-cap-s font-bold underline-offset-2">{t('currentPrice')}</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row, cell }) => {
      const valueKRW = getValue() as number;
      // 원화 마켓 보조 가격: 표시 통화가 KRW면 달러로, 아니면 표시 통화로 보여준다.
      const secondaryCurrency = displayCurrency === 'KRW' ? 'USD' : displayCurrency;
      const secondaryValue = convertFiat(valueKRW, 'KRW', secondaryCurrency, { exchangeRateUSD, fiatRates });

      return (
        <FlashCell
          key={cell.id}
          flashKey={cell.id}
          bidAskStatus={row.original.ask_bid ? row.original.ask_bid : ''}
          className={'flex flex-col items-end font-medium'}>
          {exchangeMarketType === 'KRW' && (
            <>
              <span>{valueKRW?.toLocaleString()}</span>
              <span className="text-cap-s text-fg-subtle">
                {secondaryValue !== null && formatFiat(secondaryValue, secondaryCurrency, t('numberLocale'))}
              </span>
            </>
          )}
          {exchangeMarketType === 'BTC' && <span>{valueKRW.toFixed(8)}</span>}
        </FlashCell>
      );
    },
    enableHiding: false,
  },
  {
    accessorFn: row => (row.signed_change_rate * 100).toFixed(2),
    id: 'signed_change_rate',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <p>{t('change')}</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ row, getValue }) => {
      const value = String(getValue() as number);
      const signedChangePrice = row.original.signed_change_price?.toLocaleString();
      return (
        <div className="flex flex-col items-end font-medium">
          <span
            className={`${
              row.original.change === 'RISE' ? 'text-up' : row.original.change === 'FALL' ? 'text-down' : ''
            }`}>
            {`${row.original.change === 'RISE' ? '+' : ''}${value}%`}
          </span>
          {exchangeMarketType !== 'BTC' && <span className="text-cap-s text-fg-subtle">{signedChangePrice}</span>}
        </div>
      );
    },
    enableHiding: false,
  },
  {
    accessorFn: row => (((row.highest_52_week_price - row.trade_price) / row.highest_52_week_price) * 100).toFixed(2),
    id: 'highest_52_week_diff',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span>{t('fromHigh52w')}</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = String(getValue());
      const highestPrice = row.original.highest_52_week_price?.toLocaleString();
      return (
        <div className="flex flex-col items-end text-down font-medium">
          <span>-{value}%</span>
          {exchangeMarketType !== 'BTC' ? (
            <span className="text-cap-s text-fg-subtle">{highestPrice}</span>
          ) : (
            <span className="text-cap-s text-fg-subtle">{row.original.highest_52_week_price.toFixed(8)}</span>
          )}
        </div>
      );
    },
  },
  {
    accessorFn: row => (((row.trade_price - row.lowest_52_week_price) / row.lowest_52_week_price) * 100).toFixed(2),
    id: 'lowest_52_week_diff',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <p>{t('fromLow52w')}</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = String(getValue());
      const lowestPrice = row.original.lowest_52_week_price;
      return (
        <div className="flex flex-col items-end text-up font-medium">
          <span>+{value}%</span>
          {exchangeMarketType !== 'BTC' ? (
            <span className="text-cap-s text-fg-subtle">{lowestPrice?.toLocaleString()}</span>
          ) : (
            <span className="text-cap-s text-fg-subtle">{lowestPrice?.toFixed(8)}</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'acc_trade_price_24h',
    id: 'acc_trade_price_24h',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span>{t('volume')}</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue }) => {
      const value = Number(getValue() as number);
      const formatCurrencyKR = (value: number) => {
        return new Intl.NumberFormat(t('numberLocale'), {
          style: 'currency',
          currency: 'KRW',
          notation: 'compact', // ko: 만·억·조, en: K·M·B 단위 적용
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      };

      switch (exchangeMarketType) {
        case 'KRW':
          return (
            <div className="flex justify-end font-medium p-2">
              <span>{formatCurrencyKR(value)}</span>
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
