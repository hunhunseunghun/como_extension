import { ColumnDef } from '@tanstack/react-table';
import { DisplayCurrency, getTimeframes, Translate } from '@/i18n';
import { convertFiat, FiatRates, formatFiat } from '@/lib/market';
import { BithumbTicker, FavoriteCoins, MarketType } from '@/types';
import { Star, ArrowRightLeft, ChevronsUpDown, ChartCandlestick } from 'lucide-react';
import { WarningIcon } from '@/components/ui/warningIcon';
import { getChosungRegExp, getNumberFormat } from '@/lib/format';
import { WalletStatusBadge } from '@/lib/walletStatus';
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
      const isFavorite = (favoriteCoins?.bithumb ?? []).includes(market);

      const toggleFavorite = () => {
        if (!row.getCanPin()) return; // 고정 불가능 시 무시
        setFavoriteCoins(prev => ({
          ...prev,
          bithumb: isFavorite
            ? prev.bithumb.filter(coin => coin !== market)
            : [...prev.bithumb, market],
        }));
        row.pin(isFavorite ? false : 'top');
      };

      return (
        <div className="flex min-w-0 gap-[2px] font-semibold">
          {favoriteFunc && (
            <div className="mt-[2px]">
              <Star
                className={
                  row.getIsPinned()
                    ? 'size-3 text-star fill-star hover:cursor-pointer'
                    : 'size-3 text-fg-faint hover:cursor-pointer hover:text-star hover:fill-star'
                }
                onClick={toggleFavorite}
              />
            </div>
          )}

          <div className="min-w-0 text-left">
            <div className="flex min-w-0 gap-[2px]">
              <a
                href={`https://www.bithumb.com/react/trade/order/${splitMarket.length && splitMarket[1] + '-' + splitMarket[0]}`}
                target="_blank"
                title={coinNameKR ? row.original.korean_name : row.original.english_name}
                className="truncate hover:text-fg-faint">
                {coinNameKR ? row.original.korean_name : row.original.english_name}
              </a>
              {bithumbRow.market_warning !== 'NONE' && <WarningIcon text={t('warningShort')} />}
              <WalletStatusBadge exchange="bithumb" coin={splitMarket[1]} />
            </div>
            <span className="block truncate text-cap text-fg-subtle font-medium">
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
      const chosungRegex = getChosungRegExp(searchValue);
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
            className="flex justify-center items-center hover:text-fg-highlight"
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
          className={'flex flex-col items-end font-medium whitespace-nowrap'}>
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
    // 정렬이 숫자 기준이 되도록 숫자로 둔다(문자열이면 음수끼리 순서가 뒤집힌다).
    accessorFn: row => row.signed_change_rate * 100,
    id: 'signed_change_rate',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <p>{t('change')}</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ row, getValue }) => {
      const value = (getValue() as number).toFixed(2);
      const signedChangePrice = row.original.signed_change_price?.toLocaleString();
      return (
        <div className="flex flex-col items-end font-medium whitespace-nowrap">
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
    accessorFn: row => ((row.highest_52_week_price - row.trade_price) / row.highest_52_week_price) * 100,
    id: 'highest_52_week_diff',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span>{t('fromHigh52w')}</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = (getValue() as number).toFixed(2);
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
    accessorFn: row => ((row.trade_price - row.lowest_52_week_price) / row.lowest_52_week_price) * 100,
    id: 'lowest_52_week_diff',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <p>{t('fromLow52w')}</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = (getValue() as number).toFixed(2);
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
        return getNumberFormat(t('numberLocale'), {
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
            <div className="flex justify-end font-medium p-2 whitespace-nowrap">
              <span>{formatCurrencyKR(value)}</span>
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
