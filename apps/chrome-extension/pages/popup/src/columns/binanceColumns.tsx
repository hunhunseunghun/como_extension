import { ColumnDef } from '@tanstack/react-table';
import { BinanceTicker } from '@/types';
import { Star, ArrowDownUp, ChevronsUpDown } from 'lucide-react';
import FlashCell from '@/components/FlashCell';

export const getBinanceColumns = (
  exchangeMarketType: 'KRW' | 'BTC' | 'USDT',
  favoriteCoins: { upbit: string[]; bithumb: string[]; binance: string[] },
  setFavoriteCoins: React.Dispatch<React.SetStateAction<{ upbit: string[]; bithumb: string[]; binance: string[] }>>,
  favoriteFunc: boolean,
): ColumnDef<BinanceTicker>[] => [
  {
    accessorFn: row => `${row.symbol}`,
    id: 'symbol',
    header: () => (
      <div className="flex">
        <a href="#" className="mr-[2px] font-bold">
          Name
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
          : symbol;
      const urlSymbol = row.original.symbol?.endsWith('BTC')
        ? symbol?.slice(0, -3) + '_BTC'
        : row.original?.symbol?.endsWith('USDT')
          ? symbol.slice(0, -4) + 'USDT'
          : 'BTC_USDT';
      const binanceTradeURL = `https://www.binance.com/en/trade/${urlSymbol}?type=spot`;
      const savedCoins = favoriteCoins?.upbit?.join(',');

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
          <div className="text-left break-word">
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
      if (!filterValue) return true;
      const symbol = row.original.symbol.toLowerCase();
      const searchValue = filterValue.toLowerCase().trim();
      return symbol.includes(searchValue);
    },
    enableHiding: false,
  },
  {
    accessorFn: row => (row.c ? row.c : row.lastPrice),
    id: 'lastPrice',
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

      switch (exchangeMarketType) {
        case 'USDT':
          return (
            <FlashCell
              key={cell.id}
              flashKey={cell.id}
              bidAskStatus={bidAskStatus ? bidAskStatus : ''}
              className={'flex flex-col items-end font-medium'}>
              <span>${formattedPrice.includes('e') ? lastPrice.toFixed(8) : formattedPrice}</span>
            </FlashCell>
          );
        case 'BTC':
          return (
            <FlashCell
              key={cell.id}
              flashKey={cell.id}
              bidAskStatus={bidAskStatus ? bidAskStatus : ''}
              className={'flex flex-col items-end font-medium'}>
              <span>{lastPrice.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })}</span>
            </FlashCell>
          );
      }
    },
    enableHiding: false,
  },
  {
    accessorFn: row => (row.P ? (row.P as string) : (row.priceChangePercent as string)),
    id: 'priceChangePercent',
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
            {value.toFixed(2)}%
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
  // {
  //   accessorFn: row => (((row.highest_52_week_price - row.trade_price) / row.highest_52_week_price) * 100).toFixed(2),
  //   id: 'highest_52_week_diff',
  //   header: ({ column }) => (
  //     <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
  //       <span>고가대비(52주)</span>
  //       <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
  //     </div>
  //   ),
  //   cell: ({ getValue, row }) => {
  //     const value = String(getValue());
  //     const highestPrice = row.original.highest_52_week_price?.toLocaleString();
  //     return (
  //       <div className="flex flex-col items-end text-blue-500 font-medium">
  //         <span>-{value}%</span>
  //         {exchangeMarketType !== 'BTC' ? (
  //           <span className="text-[10px] text-gray-500">{highestPrice}</span>
  //         ) : (
  //           <span className="text-[10px] text-gray-500">{row.original.highest_52_week_price.toFixed(8)}</span>
  //         )}
  //       </div>
  //     );
  //   },
  // },
  // {
  //   accessorFn: row => (((row.trade_price - row.lowest_52_week_price) / row.lowest_52_week_price) * 100).toFixed(2),
  //   id: 'lowest_52_week_diff',
  //   header: ({ column }) => (
  //     <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
  //       <p>저가대비(52주)</p>
  //       <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
  //     </div>
  //   ),
  //   cell: ({ getValue, row }) => {
  //     const value = String(getValue());
  //     const lowestPrice = row.original.lowest_52_week_price;
  //     return (
  //       <div className="flex flex-col items-end text-red-500 font-medium">
  //         <span>+{value}%</span>
  //         {exchangeMarketType !== 'BTC' ? (
  //           <span className="text-[10px] text-gray-500">{lowestPrice?.toLocaleString()}</span>
  //         ) : (
  //           <span className="text-[10px] text-gray-500">{lowestPrice?.toFixed(8)}</span>
  //         )}
  //       </div>
  //     );
  //   },
  // },
  {
    accessorFn: row => {
      const ask = parseFloat(row.a as string) || 0;
      const bid = parseFloat(row.b as string) || 0;
      const lastPrice = parseFloat(row.c as string) || 0;
      return lastPrice === 0 ? 0 : (((ask - bid) / lastPrice) * 100).toFixed(2);
    },
    id: 'bid_ask_spread',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <p>매수-매도 스프레드</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue }) => {
      const spread = parseFloat(getValue() as string);
      let spreadClass = 'text-gray-500';

      if (spread < 0.05) spreadClass = 'text-green-500';
      else if (spread < 0.2) spreadClass = 'text-blue-500';
      else if (spread < 1) spreadClass = 'text-orange-500';
      else spreadClass = 'text-red-500';

      return (
        <div className={`flex font-medium ${spreadClass} justify-end`}>
          <span>{spread.toLocaleString()}</span>
        </div>
      );
    },
  },

  // 체결 강도 (Volume Ratio)
  {
    accessorFn: row => {
      const buyVolume = parseFloat(row.Q as string) || 0; // 실제 매수 거래량 필드로 교체 필요
      const sellVolume = parseFloat(row.q as string) || 0; // 실제 매도 거래량 필드로 교체 필요
      return sellVolume === 0 ? 0 : (buyVolume / sellVolume).toFixed(2);
    },
    id: 'volume_ratio',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <p>체결 강도</p>
        <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
      </div>
    ),
    cell: ({ getValue }) => {
      const ratio = parseFloat(getValue() as string);
      let ratioClass = 'text-gray-500';

      if (ratio > 2) ratioClass = 'text-green-500';
      else if (ratio > 1.1) ratioClass = 'text-blue-500';
      else if (ratio > 0.9) ratioClass = 'text-gray-500';
      else if (ratio > 0.5) ratioClass = 'text-orange-500';
      else ratioClass = 'text-red-500';

      return (
        <div className={`flex font-medium ${ratioClass} justify-end`}>
          <span>{ratio.toLocaleString()}</span>
        </div>
      );
    },
  },
  {
    accessorFn: row => (row.q ? (row.q as string) : (row.quoteVolume as string)),
    id: 'acc_trade_price_24h',
    header: ({ column }) => (
      <div className="flex justify-end font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        <span>거래대금(24h)</span>
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
            <div className="flex flex-col items-end font-medium">
              <span>{formatCurrencyUS(value)}</span>
            </div>
          );
        case 'BTC':
          return (
            <div className="flex justify-end font-medium">
              <span>{value >= 1 ? value.toFixed(2) : value.toFixed(5)}</span>
            </div>
          );
      }
    },
    enableHiding: false,
  },
];
