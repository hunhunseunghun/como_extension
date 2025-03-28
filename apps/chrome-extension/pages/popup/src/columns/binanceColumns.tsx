import { ColumnDef, SortingState } from '@tanstack/react-table';
import { BinanceTicker } from '@/types';
import { Star, ArrowDownUp, ChevronsUpDown, ChartCandlestick } from 'lucide-react';
import FlashCell from '@/components/FlashCell';
import ChartToolTip from '@/components/ChartToolTip';

export const getBinanceColumns = (
  exchangeMarketType: 'KRW' | 'BTC' | 'USDT',
  favoriteCoins: { upbit: string[]; bithumb: string[]; binance: string[] },
  setFavoriteCoins: React.Dispatch<React.SetStateAction<{ upbit: string[]; bithumb: string[]; binance: string[] }>>,
  favoriteFunc: boolean,
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>,
  wideSize: boolean,
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
          이름
        </a>
        <ArrowDownUp size={10} strokeWidth={3} className="mt-[2px]" />
      </div>
    ),
    cell: ({ row }) => {
      const symbol = row.original.symbol;
      const removeMarket = row.original.symbol?.endsWith('BTC')
        ? symbol.slice(0, -3)
        : row.original.symbol?.endsWith('USDT')
          ? symbol.slice(0, -4)
          : row.original.symbol;

      const binanceTradeURL = `https://www.binance.com/en/trade/${symbol}?type=spot`;
      const savedCoins = favoriteCoins?.binance?.join(',') || '';

      const toggleFavorite = () => {
        if (!row.getCanPin()) return; // 고정 불가능 시 무시
        setFavoriteCoins(prev => {
          const updated = { ...prev };
          if (savedCoins.includes(symbol)) {
            updated.binance = updated.binance.filter(coin => coin !== symbol);
            row.pin(false); // 고정 해제
          } else {
            updated.binance = [...updated.binance, symbol];
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
              <a href={binanceTradeURL} target="_blank" className="hover:text-gray-400">
                {removeMarket}
              </a>
            </div>
            <span className="text-[11px] text-gray-500 font-medium">{symbol}</span>
          </div>
        </div>
      );
    },
    filterFn: (row, _columnId, filterValue) => {
      const symbol = row.original.symbol.toLowerCase();
      const searchValue = filterValue.toLowerCase().trim();
      if (!filterValue) return true;
      const removeMarket = symbol?.endsWith('BTC')
        ? symbol.slice(0, -3)
        : symbol?.endsWith('USDT')
          ? symbol.slice(0, -4)
          : symbol;
      const fullTextMatch = removeMarket.includes(searchValue);
      return fullTextMatch;
    },
    enableHiding: false,
    size: 103,
  },
  {
    accessorKey: 'candlestick_chart',
    header: ({ column }) => (
      <div className="flex justify-center" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span className="text-[10px] font-bold underline-offset-2">차트</span>
      </div>
    ),
    cell: ({ row }) => {
      return (
        <div className="flex justify-center items-center">
          <ChartToolTip
            className="flex justify-center items-center hover:text-red-500"
            symbol={row.original.symbol}
            exchange="binance"
            wideSize={wideSize}>
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
        <span className="text-[10px] font-bold underline-offset-2">현재가</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row, cell }) => {
      const lastPrice = Number(getValue() as string);
      const bidPrice = row.original.b || '0';
      const bidAskStatus = Number(lastPrice) <= Number(bidPrice) ? 'BID' : 'ASK';
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
            {exchangeMarketType === 'USDT'
              ? `$${formattedPrice.includes('e') ? lastPrice.toFixed(8) : formattedPrice}`
              : lastPrice.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}
          </span>
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
        <p>전일대비</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ row, getValue }) => {
      const value = Number(getValue());
      const priceChange = Number(row.original.priceChange);
      const formattedPriceChange = row.original.priceChange?.replace(/\.?0+$/, '');

      return (
        <div className="flex flex-col items-end font-medium">
          <span className={`${priceChange > 0 ? 'text-red-500' : priceChange < 0 ? 'text-blue-500' : ''}`}>
            {`${value > 0 ? '+' : ''}${value.toFixed(2)}`}%
          </span>
          {exchangeMarketType !== 'BTC' && (
            <span className="text-[10px] text-gray-500">
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
        <span>고가대비(24H)</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = Number(getValue());
      const highestPrice = row.original.h ? Number(row.original.h) : Number(row.original.highPrice);
      return (
        <div
          className={`flex flex-col items-end ${value < 0 ? 'text-blue-500' : value > 0 ? 'text-red-500' : 'text-black-500'} font-medium`}>
          <span>{value.toFixed(2)}%</span>
          {exchangeMarketType !== 'BTC' ? (
            <span className="text-[10px] text-gray-500">
              {highestPrice > 1 ? highestPrice?.toFixed(2) : String(highestPrice).replace(/\.?0+$/, '')}
            </span>
          ) : (
            <span className="text-[10px] text-gray-500">{Number(highestPrice)?.toFixed(8)}</span>
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
        <p>저가대비(24H)</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const value = Number(getValue());
      const lowestPrice = row.original.l ? Number(row.original.l) : Number(row.original.lowPrice);
      return (
        <div
          className={`flex flex-col items-end ${value > 0 ? 'text-red-500' : value < 0 ? 'text-blue-500' : 'text-black-500'} font-medium`}>
          <span>+{value.toFixed(2)}%</span>
          {exchangeMarketType !== 'BTC' ? (
            <span className="text-[10px] text-gray-500">
              {lowestPrice > 1 ? lowestPrice?.toFixed(2) : String(lowestPrice).replace(/\.?0+$/, '')}
            </span>
          ) : (
            <span className="text-[10px] text-gray-500">{lowestPrice?.toFixed(8)}</span>
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
        <span>거래금(일)</span>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue }) => {
      const value = Number(getValue());
      const formatCurrencyUS = (value: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact', // K, M, B 단위로 축약
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      };

      switch (exchangeMarketType) {
        case 'USDT':
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
