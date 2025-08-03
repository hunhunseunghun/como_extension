import { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { CoinbaseTicker } from '@/types';
import { Star, ArrowRightLeft, ChevronsUpDown, ChartCandlestick } from 'lucide-react';
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

// 테이블 헤더를 위한 React 컴포넌트들
const TranslatedRightHeader = ({
  translationKey,
  onClick,
  children,
}: {
  translationKey: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end font-bold" onClick={onClick}>
      <span>{t(translationKey)}</span>
      {children}
    </div>
  );
};

const KoreanNameHeader = ({
  coinNameKR,
  onClick,
  children,
}: {
  coinNameKR: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex" onClick={onClick}>
      <a href="#" className="mr-[2px] font-bold">
        {coinNameKR ? t('koreanName') : t('englishName')}
      </a>
      {children}
    </div>
  );
};

export const getCoinbaseColumns = (
  coinNameKR: boolean,
  setCoinNameKR: (value: boolean) => void,
  exchangeRateUSD: number,
  exchangeMarketType: 'KRW' | 'BTC' | 'USDT' | 'USD' | 'EUR' | 'GBP',
  favoriteCoins: { upbit: string[]; bithumb: string[]; binance: string[]; coinbase: string[] },
  setFavoriteCoins: React.Dispatch<
    React.SetStateAction<{ upbit: string[]; bithumb: string[]; binance: string[]; coinbase: string[] }>
  >,
  favoriteFunc: boolean,
  wideSize: boolean,
  timeframe: string,
  setTimeframe: (value: string) => void,
): ColumnDef<CoinbaseTicker>[] => [
  {
    accessorFn: row => `${row.product_id}-${row.price}`,
    id: 'market',
    header: () => (
      <KoreanNameHeader coinNameKR={coinNameKR} onClick={() => setCoinNameKR(!coinNameKR)}>
        <ArrowRightLeft size={10} strokeWidth={3} className="mt-[2px]" />
      </KoreanNameHeader>
    ),
    cell: ({ row }) => {
      const market = row.original.product_id;
      const savedCoins = favoriteCoins?.coinbase?.join(',') || '';

      const toggleFavorite = () => {
        if (!row.getCanPin()) return;
        setFavoriteCoins(prev => {
          const updated = { ...prev };
          if (savedCoins.includes(market)) {
            updated.coinbase = updated.coinbase.filter(coin => coin !== market);
            row.pin(false);
          } else {
            updated.coinbase = [...updated.coinbase, market];
            row.pin('top');
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
                href={`https://pro.coinbase.com/trade/${row.original.product_id}`}
                target="_blank"
                className="hover:text-gray-400">
                {coinNameKR ? row.original.product_id : row.original.product_id}
              </a>
            </div>
            <span className="text-[11px] text-gray-500 font-medium">{row.original.product_id}</span>
          </div>
        </div>
      );
    },
    enableHiding: false,
    size: 110,
    minSize: 110, // 최소 너비 110px 보장
  },
  {
    accessorKey: 'candlestick_chart',
    header: () => {
      const { t } = useTranslation();
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-5 w-11 text-[10px] font-semibold gap-0.5 hover:cursor-pointer">
              <span>{t('chart')}</span>
              <ChevronDown className="size-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="relative left-1 w-13 data-[side=bottom]:slide-in-from-top-2 z-52">
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
      );
    },
    cell: ({ row }) => {
      return (
        <div className="flex justify-center items-center">
          <ChartToolTip
            className="flex justify-center items-center hover:text-red-500"
            symbol={row.original.product_id}
            exchange="coinbase"
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
    accessorFn: row => Number(row.price),
    id: 'price',
    header: ({ column }) => (
      <TranslatedRightHeader
        translationKey="current_price"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </TranslatedRightHeader>
    ),
    cell: ({ row, cell }) => {
      const price = Number(row.original.price);
      const usdPrice = price * exchangeRateUSD;

      return (
        <FlashCell key={cell.id} flashKey={cell.id} bidAskStatus="" className={'flex flex-col items-end font-medium'}>
          {exchangeMarketType === 'USD' && (
            <>
              <span>${price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span key={exchangeRateUSD} className="text-[10px] text-gray-500">
                {exchangeRateUSD > 0 &&
                  `₩${usdPrice.toLocaleString('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}`}
              </span>
            </>
          )}
          {exchangeMarketType === 'USDT' && (
            <>
              <span>${price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span key={exchangeRateUSD} className="text-[10px] text-gray-500">
                {exchangeRateUSD > 0 &&
                  `₩${usdPrice.toLocaleString('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}`}
              </span>
            </>
          )}
          {exchangeMarketType === 'EUR' && (
            <>
              <span>€{price?.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span key={exchangeRateUSD} className="text-[10px] text-gray-500">
                {exchangeRateUSD > 0 &&
                  `₩${usdPrice.toLocaleString('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}`}
              </span>
            </>
          )}
          {exchangeMarketType === 'GBP' && (
            <>
              <span>£{price?.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span key={exchangeRateUSD} className="text-[10px] text-gray-500">
                {exchangeRateUSD > 0 &&
                  `₩${usdPrice.toLocaleString('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}`}
              </span>
            </>
          )}
        </FlashCell>
      );
    },
    enableHiding: false,
  },
  {
    accessorFn: row => {
      const price = Number(row.price);
      const open24h = Number(row.open_24h);
      return open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
    },
    id: 'signed_change_rate',
    header: ({ column }) => (
      <TranslatedRightHeader
        translationKey="change_rate"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </TranslatedRightHeader>
    ),
    cell: ({ row }) => {
      const price = Number(row.original.price);
      const open24h = Number(row.original.open_24h);
      const changeRate = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
      const changeAmount = price - open24h;
      const isRise = changeRate > 0;
      const isFall = changeRate < 0;

      return (
        <div className="flex flex-col items-end font-medium">
          <span className={`${isRise ? 'text-red-500' : isFall ? 'text-blue-500' : ''}`}>
            {`${isRise ? '+' : ''}${changeRate.toFixed(2)}%`}
          </span>
          <span className="text-[10px] text-gray-500">{changeAmount.toFixed(2)}</span>
        </div>
      );
    },
    enableHiding: false,
  },

  {
    accessorFn: row => {
      const price = Number(row.price);
      const high24h = Number(row.high_24h);
      return high24h > 0 ? ((price - high24h) / high24h) * 100 : 0;
    },
    id: 'highest_24h_diff',
    header: ({ column }) => (
      <TranslatedRightHeader
        translationKey="high_price_diff"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </TranslatedRightHeader>
    ),
    cell: ({ row }) => {
      const price = Number(row.original.price);
      const high24h = Number(row.original.high_24h);
      const changeRate = high24h > 0 ? ((price - high24h) / high24h) * 100 : 0;

      return (
        <div className="flex flex-col items-end text-blue-500 font-medium">
          <span>-{Math.abs(changeRate).toFixed(2)}%</span>
          <span className="text-[10px] text-gray-500">{high24h?.toLocaleString()}</span>
        </div>
      );
    },
    enableHiding: !wideSize,
  },
  {
    accessorFn: row => {
      const price = Number(row.price);
      const low24h = Number(row.low_24h);
      return low24h > 0 ? ((price - low24h) / low24h) * 100 : 0;
    },
    id: 'lowest_24h_diff',
    header: ({ column }) => (
      <TranslatedRightHeader
        translationKey="low_price_diff"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </TranslatedRightHeader>
    ),
    cell: ({ row }) => {
      const price = Number(row.original.price);
      const low24h = Number(row.original.low_24h);
      const changeRate = low24h > 0 ? ((price - low24h) / low24h) * 100 : 0;

      return (
        <div className="flex flex-col items-end text-red-500 font-medium">
          <span>+{changeRate.toFixed(2)}%</span>
          <span className="text-[10px] text-gray-500">{low24h?.toLocaleString()}</span>
        </div>
      );
    },
    enableHiding: !wideSize,
  },
  {
    accessorKey: 'volume_24h',
    id: 'acc_trade_price_24h',
    header: ({ column }) => (
      <TranslatedRightHeader
        translationKey="trade_volume"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </TranslatedRightHeader>
    ),
    cell: ({ getValue }) => {
      const volume = Number(getValue() as string);
      const volumeKRW = volume * exchangeRateUSD;

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

      const formatCurrencyEUR = (value: number) => {
        return new Intl.NumberFormat('de-DE', {
          style: 'currency',
          currency: 'EUR',
          notation: 'compact',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      };

      const formatCurrencyGBP = (value: number) => {
        return new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency: 'GBP',
          notation: 'compact',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      };

      switch (exchangeMarketType) {
        case 'USD':
          return (
            <div className="flex justify-end font-medium p-2">
              <span>{formatCurrencyUS(volume)}</span>
            </div>
          );
        case 'USDT':
          return (
            <div className="flex justify-end font-medium p-2">
              <span>{formatCurrencyUS(volume)}</span>
            </div>
          );
        case 'EUR':
          return (
            <div className="flex justify-end font-medium p-2">
              <span>{formatCurrencyEUR(volume)}</span>
            </div>
          );
        case 'GBP':
          return (
            <div className="flex justify-end font-medium p-2">
              <span>{formatCurrencyGBP(volume)}</span>
            </div>
          );
        default:
          return (
            <div className="flex justify-end font-medium p-2">
              <span>{formatCurrencyKR(volumeKRW)}</span>
            </div>
          );
      }
    },
    enableHiding: false,
  },
];
