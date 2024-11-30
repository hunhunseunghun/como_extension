import { ColumnDef } from '@tanstack/react-table';
import { UpbitTicker } from '@/types';
import { Star, ArrowRightLeft, ChevronsUpDown, ChartCandlestick } from 'lucide-react';
import { WarningIcon, CautionIcon } from '@/components/ui/warningIcon';
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
// import ChartCell from '@/components/ChartCell';

const timeframes = [
  { value: '1m', label: '1분' },
  { value: '3m', label: '3분' },
  { value: '5m', label: '5분' },
  { value: '10m', label: '10분' },
  { value: '15m', label: '15분' },
  { value: '30m', label: '30분' },
  { value: '60m', label: '1시간' },
  { value: '240m', label: '4시간' },
  { value: '1d', label: '1일' },
  { value: '1w', label: '1주' },
  { value: '1M', label: '1월' },
];

export const getUpbitColumns = (
  coinNameKR: boolean,
  setCoinNameKR: (value: boolean) => void,
  exchangeRateUSD: number,
  exchangeMarketType: 'KRW' | 'BTC' | 'USDT',
  favoriteCoins: { upbit: string[]; bithumb: string[]; binance: string[] },
  setFavoriteCoins: React.Dispatch<React.SetStateAction<{ upbit: string[]; bithumb: string[]; binance: string[] }>>,
  favoriteFunc: boolean,
  wideSize: boolean,
  timeframe: string,
  setTimeframe: (value: string) => void,
): ColumnDef<UpbitTicker>[] => [
  {
    accessorFn: row => `${row.korean_name} ${row.market}`,
    id: 'market',
    header: () => (
      <div className="flex" onClick={() => setCoinNameKR(!coinNameKR)}>
        <a href="#" className="mr-[2px] font-bold">
          {coinNameKR ? '한글명' : '영문명'}
        </a>
        <ArrowRightLeft size={10} strokeWidth={3} className="mt-[2px]" />
      </div>
    ),
    cell: ({ row }) => {
      const splitMarket = row.original.market?.split('-');
      const convertMarket = splitMarket[1] + '/' + splitMarket[0];
      const upbitRow = row.original as { market_event?: { warning: boolean; caution: boolean } }; // Upbit 전용 필드 접근
      const market = row.original.market;
      const savedCoins = favoriteCoins?.upbit?.join(',') || '';

      const toggleFavorite = () => {
        if (!row.getCanPin()) return; // 고정 불가능 시 무시
        setFavoriteCoins(prev => {
          const updated = { ...prev };
          if (savedCoins.includes(market)) {
            updated.upbit = updated.upbit.filter(coin => coin !== market);
            row.pin(false); // 고정 해제
          } else {
            updated.upbit = [...updated.upbit, market];
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
                    : 'size-3 text-gray-400 hover:cursor-pointer hover:text-yellow-400 hover:fill-yellow-400'
                }
                onClick={toggleFavorite}
              />
            </div>
          )}
          <div className="text-left">
            <div className="flex gap-[2px]">
              <a
                href={`https://upbit.com/exchange?code=CRIX.UPBIT.${row.original?.market}`}
                target="_blank"
                className="hover:text-gray-400">
                {coinNameKR ? row.original.korean_name : row.original.english_name}
              </a>
              <div className="flex gap-[1px] items-center">
                {upbitRow.market_event?.warning && <WarningIcon />}
                {upbitRow.market_event?.caution && <CautionIcon />}
              </div>
            </div>
            <span className="text-[11px] text-gray-500 font-medium">{convertMarket}</span>
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
          <Button variant="outline" className="h-5 w-11 text-[10px] font-semibold gap-0.5 hover:cursor-pointer">
            <span>{timeframes.find(tf => tf.value === timeframe)?.label}</span>
            <ChevronDown className="size-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="relative left-1 w-13 data-[side=bottom]:slide-in-from-top-2">
          <DropdownMenuGroup>
            {timeframes.map(({ value, label }) => (
              <DropdownMenuItem
                key={value}
                textValue={label}
                className="gap-1 px-1 py-1  items-left text-xs hover:cursor-pointer"
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
            exchange="upbit"
            timeframe={timeframe}
            wideSize={wideSize}>
            <ChartCandlestick size={16} />
          </ChartToolTip>
        </div>
      );
    },
    enableHiding: false,
  },
  {
    accessorKey: 'trade_price',
    header: ({ column }) => (
      <div className="flex justify-end" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span className="text-[10px] font-bold underline-offset-2">현재가</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row, cell }) => {
      const valueKRW = getValue() as number;
      const changeRateKRW = exchangeRateUSD > 0 ? valueKRW / exchangeRateUSD : 0;

      return (
        <FlashCell
          key={cell.id}
          flashKey={cell.id}
          bidAskStatus={row.original.ask_bid ? row.original.ask_bid : ''}
          className={'flex flex-col items-end font-medium'}>
          {exchangeMarketType === 'KRW' && (
            <>
              <span>{valueKRW?.toLocaleString()}</span>
              <span key={exchangeRateUSD} className="text-[10px] text-gray-500">
                {exchangeRateUSD > 0 &&
                  `$${changeRateKRW.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
              </span>
            </>
          )}
          {exchangeMarketType === 'BTC' && <span>{valueKRW.toFixed(8)}</span>}
          {exchangeMarketType === 'USDT' && (
            <span>${valueKRW.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          )}
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
        <p>전일대비</p>
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
              row.original.change === 'RISE' ? 'text-red-500' : row.original.change === 'FALL' ? 'text-blue-500' : ''
            }`}>
            {`${row.original.change === 'RISE' ? '+' : ''}${value}%`}
          </span>
          {exchangeMarketType !== 'BTC' && <span className="text-[10px] text-gray-500">{signedChangePrice}</span>}
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
        <span>고가대비(52주)</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = String(getValue());
      const highestPrice = row.original.highest_52_week_price?.toLocaleString();
      return (
        <div className="flex flex-col items-end text-blue-500 font-medium">
          <span>-{value}%</span>
          {exchangeMarketType !== 'BTC' ? (
            <span className="text-[10px] text-gray-500">{highestPrice}</span>
          ) : (
            <span className="text-[10px] text-gray-500">{row.original.highest_52_week_price.toFixed(8)}</span>
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
        <p>저가대비(52주)</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = String(getValue());
      const lowestPrice = row.original.lowest_52_week_price;
      return (
        <div className="flex flex-col items-end text-red-500 font-medium">
          <span>+{value}%</span>
          {exchangeMarketType !== 'BTC' ? (
            <span className="text-[10px] text-gray-500">{lowestPrice?.toLocaleString()}</span>
          ) : (
            <span className="text-[10px] text-gray-500">{lowestPrice?.toFixed(8)}</span>
          )}
        </div>
      );
    },
    enableResizing: false,
  },
  {
    accessorKey: 'acc_trade_price_24h',
    id: 'acc_trade_price_24h',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span>거래금(일)</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue }) => {
      const value = Number(getValue() as number);
      const formatCurrencyUS = (value: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact', // K, M, B 단위로 축약
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      };
      const formatCurrencyKR = (value: number) => {
        return new Intl.NumberFormat('ko-KR', {
          style: 'currency',
          currency: 'KRW',
          notation: 'compact', // 자동으로 만, 억, 조 단위 적용
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
            <div className="flex flex-col items-end font-medium p-2">
              <span>{value >= 1 ? value.toFixed(2) : value.toFixed(5)}</span>
            </div>
          );
        case 'USDT':
          return (
            <div className="flex flex-col items-end font-medium p-2">
              <span>{formatCurrencyUS(value)}</span>
            </div>
          );
      }
    },
    enableHiding: false,
  },
];
