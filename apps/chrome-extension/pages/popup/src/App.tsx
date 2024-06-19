import { useState, useEffect, useMemo } from 'react';
import './App.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
  SortingState,
  getSortedRowModel,
  flexRender,
  ColumnFiltersState,
  getFilteredRowModel,
  VisibilityState,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ModeToggle } from '@/components/ModeToggle';
import { SizeToggle } from '@/components/SizeToggle';
import { MarketDropdown } from '@/components/MarketDropdown';
import FlashCell from '@/components/FlashCell';
import { getRegExp } from 'korean-regexp';
import { Search, ArrowRightLeft, ChevronsUpDown } from 'lucide-react';
import { WarningIcon, CautionIcon } from '@/components/ui/warningIcon';
import comoLogo from '@/assets/icons/como-logo.png';

// 1. Ticker 객체 타입 정의
type Ticker = {
  market: string;
  trade_date: string;
  trade_time: string;
  trade_timestamp: number;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  prev_closing_price: number;
  change: 'RISE' | 'EVEN' | 'FALL';
  change_price: number;
  change_rate: number;
  signed_change_price: number;
  signed_change_rate: number;
  trade_volume: number;
  acc_trade_price: number;
  acc_trade_price_24h: number;
  acc_trade_volume: number;
  acc_trade_volume_24h: number;
  highest_52_week_price: number;
  highest_52_week_date: string;
  lowest_52_week_price: number;
  lowest_52_week_date: string;
  timestamp: number;
  trade_date_kst: string;
  trade_time_kst: string;
  type?: string;
  code?: string;
  ask_bid?: 'ASK' | 'BID';
  acc_ask_volume?: number;
  acc_bid_volume?: number;
  market_state?: 'PREVIEW' | 'ACTIVE' | 'DELISTED';
  is_trading_suspended?: boolean;
  delisting_date?: string | null;
  market_warning?: 'NONE' | 'CAUTION';
  stream_type?: 'SNAPSHOT' | 'REALTIME';
  korean_name?: string;
  english_name?: string;
  market_event: {
    warning: boolean;
    caution: boolean;
  };
};

const App = () => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [tickers, setTickers] = useState<{ [key: string]: Ticker }>({
    'KRW-ETH': {
      market: 'KRW-ETH',
      trade_date: '20240822',
      trade_time: '071600',
      trade_date_kst: '20240822',
      trade_time_kst: '161600',
      trade_timestamp: 1724310960320,
      opening_price: 3564000,
      high_price: 3576000,
      low_price: 3515000,
      trade_price: 3560000,
      prev_closing_price: 3564000,
      change: 'FALL',
      change_price: 4000,
      change_rate: 0.0011223345,
      signed_change_price: -4000,
      signed_change_rate: -0.0011223345,
      trade_volume: 0.00281214,
      acc_trade_price: 14864479133.80843,
      acc_trade_price_24h: 59043494176.58761,
      acc_trade_volume: 4188.3697943,
      acc_trade_volume_24h: 16656.93091147,
      highest_52_week_price: 5783000,
      highest_52_week_date: '2024-03-13',
      lowest_52_week_price: 2087000,
      lowest_52_week_date: '2023-10-12',
      timestamp: 1724310960351,
      korean_name: '이더리움',
      english_name: 'etherium',
      ask_bid: 'ASK',
      market_event: {
        warning: true,
        caution: false,
      },
    },
    'KRW-BTC': {
      market: 'KRW-BTC',
      trade_date: '20240822',
      trade_time: '071602',
      trade_date_kst: '20240822',
      trade_time_kst: '161602',
      trade_timestamp: 1724310962713,
      opening_price: 82900000,
      high_price: 83000000,
      low_price: 81280000,
      trade_price: 82324000,
      prev_closing_price: 82900000,
      change: 'FALL',
      change_price: 576000,
      change_rate: 0.0069481303,
      signed_change_price: -576000,
      signed_change_rate: -0.0069481303,
      trade_volume: 0.00042335,
      acc_trade_price: 66058843588.46906,
      acc_trade_price_24h: 250206655398.15125,
      acc_trade_volume: 803.00214714,
      acc_trade_volume_24h: 3047.01625142,
      highest_52_week_price: 105000000,
      highest_52_week_date: '2024-03-14',
      lowest_52_week_price: 34100000,
      lowest_52_week_date: '2023-09-11',
      timestamp: 1724310962747,
      korean_name: '비트코인',
      english_name: 'bitcoin',
      ask_bid: 'BID',
      market_event: {
        warning: false,
        caution: true,
      },
    },
    'KRW-BCH': {
      market: 'KRW-BCH',
      trade_date: '20240822',
      trade_time: '071602',
      trade_date_kst: '20240822',
      trade_time_kst: '161602',
      trade_timestamp: 1724310962713,
      opening_price: 82900000,
      high_price: 83000000,
      low_price: 81280000,
      trade_price: 82324000,
      prev_closing_price: 82900000,
      change: 'FALL',
      change_price: 576000,
      change_rate: 0.0069481303,
      signed_change_price: -576000,
      signed_change_rate: -0.0069481303,
      trade_volume: 0.00042335,
      acc_trade_price: 66058843588.46906,
      acc_trade_price_24h: 250206655398.15125,
      acc_trade_volume: 803.00214714,
      acc_trade_volume_24h: 3047.01625142,
      highest_52_week_price: 105000000,
      highest_52_week_date: '2024-03-14',
      lowest_52_week_price: 34100000,
      lowest_52_week_date: '2023-09-11',
      timestamp: 1724310962747,
      korean_name: '비트코인캐시',
      english_name: 'bitcoincash',
      ask_bid: 'BID',
      market_event: {
        warning: false,
        caution: true,
      },
    },
    'KRW-AAVE': {
      market: 'KRW-AAVE',
      trade_date: '20240822',
      trade_time: '071602',
      trade_date_kst: '20240822',
      trade_time_kst: '161602',
      trade_timestamp: 1724310962713,
      opening_price: 82900000,
      high_price: 83000000,
      low_price: 81280000,
      trade_price: 82324000,
      prev_closing_price: 82900000,
      change: 'FALL',
      change_price: 576000,
      change_rate: 0.0069481303,
      signed_change_price: -576000,
      signed_change_rate: -0.0069481303,
      trade_volume: 0.00042335,
      acc_trade_price: 66058843588.46906,
      acc_trade_price_24h: 250206655398.15125,
      acc_trade_volume: 803.00214714,
      acc_trade_volume_24h: 3047.01625142,
      highest_52_week_price: 105000000,
      highest_52_week_date: '2024-03-14',
      lowest_52_week_price: 34100000,
      lowest_52_week_date: '2023-09-11',
      timestamp: 1724310962747,
      korean_name: '에이브',
      english_name: 'aave',
      ask_bid: 'BID',
      market_event: {
        warning: false,
        caution: true,
      },
    },
    'SOL-KRW': {
      market: 'SOL-KRW',
      trade_date: '20240822',
      trade_time: '071602',
      trade_date_kst: '20240822',
      trade_time_kst: '161602',
      trade_timestamp: 1724310962713,
      opening_price: 82900000,
      high_price: 83000000,
      low_price: 81280000,
      trade_price: 82324000,
      prev_closing_price: 82900000,
      change: 'FALL',
      change_price: 576000,
      change_rate: 0.0069481303,
      signed_change_price: -576000,
      signed_change_rate: -0.0069481303,
      trade_volume: 0.00042335,
      acc_trade_price: 66058843588.46906,
      acc_trade_price_24h: 250206655398.15125,
      acc_trade_volume: 803.00214714,
      acc_trade_volume_24h: 3047.01625142,
      highest_52_week_price: 105000000,
      highest_52_week_date: '2024-03-14',
      lowest_52_week_price: 34100000,
      lowest_52_week_date: '2023-09-11',
      timestamp: 1724310962747,
      korean_name: '솔라나',
      english_name: 'solana',
      ask_bid: 'BID',
      market_event: {
        warning: false,
        caution: true,
      },
    },
    'KRW-BSV': {
      market: 'KRW-BSV',
      trade_date: '20240822',
      trade_time: '071602',
      trade_date_kst: '20240822',
      trade_time_kst: '161602',
      trade_timestamp: 1724310962713,
      opening_price: 82900000,
      high_price: 83000000,
      low_price: 81280000,
      trade_price: 82324000,
      prev_closing_price: 82900000,
      change: 'FALL',
      change_price: 576000,
      change_rate: 0.0069481303,
      signed_change_price: -576000,
      signed_change_rate: -0.0069481303,
      trade_volume: 0.00042335,
      acc_trade_price: 66058843588.46906,
      acc_trade_price_24h: 250206655398.15125,
      acc_trade_volume: 803.00214714,
      acc_trade_volume_24h: 3047.01625142,
      highest_52_week_price: 105000000,
      highest_52_week_date: '2024-03-14',
      lowest_52_week_price: 34100000,
      lowest_52_week_date: '2023-09-11',
      timestamp: 1724310962747,
      korean_name: '비트코인에스브이',
      english_name: 'bitcoinSV',
      ask_bid: 'BID',
      market_event: {
        warning: false,
        caution: true,
      },
    },
    'KRW-ETC': {
      market: 'KRW-ETC',
      trade_date: '20240822',
      trade_time: '071602',
      trade_date_kst: '20240822',
      trade_time_kst: '161602',
      trade_timestamp: 1724310962713,
      opening_price: 82900000,
      high_price: 83000000,
      low_price: 81280000,
      trade_price: 82324000,
      prev_closing_price: 82900000,
      change: 'FALL',
      change_price: 576000,
      change_rate: 0.0069481303,
      signed_change_price: -576000,
      signed_change_rate: -0.0069481303,
      trade_volume: 0.00042335,
      acc_trade_price: 66058843588.46906,
      acc_trade_price_24h: 250206655398.15125,
      acc_trade_volume: 803.00214714,
      acc_trade_volume_24h: 3047.01625142,
      highest_52_week_price: 105000000,
      highest_52_week_date: '2024-03-14',
      lowest_52_week_price: 34100000,
      lowest_52_week_date: '2023-09-11',
      timestamp: 1724310962747,
      korean_name: '이더리움클래식',
      english_name: 'etheriumClassic',
      ask_bid: 'BID',
      market_event: {
        warning: false,
        caution: true,
      },
    },
    'KRW-TTC': {
      market: 'KRW-TTC',
      trade_date: '20240822',
      trade_time: '071602',
      trade_date_kst: '20240822',
      trade_time_kst: '161602',
      trade_timestamp: 1724310962713,
      opening_price: 82900000,
      high_price: 83000000,
      low_price: 81280000,
      trade_price: 82324000,
      prev_closing_price: 82900000,
      change: 'FALL',
      change_price: 576000,
      change_rate: 0.0069481303,
      signed_change_price: -576000,
      signed_change_rate: -0.0069481303,
      trade_volume: 0.00042335,
      acc_trade_price: 66058843588.46906,
      acc_trade_price_24h: 250206655398.15125,
      acc_trade_volume: 803.00214714,
      acc_trade_volume_24h: 3047.01625142,
      highest_52_week_price: 105000000,
      highest_52_week_date: '2024-03-14',
      lowest_52_week_price: 34100000,
      lowest_52_week_date: '2023-09-11',
      timestamp: 1724310962747,
      korean_name: '테조',
      english_name: 'tezo',
      ask_bid: 'BID',
      market_event: {
        warning: false,
        caution: true,
      },
    },
  });

  const [tableData, setTableData] = useState<Ticker[]>(Object.values(tickers));
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [wideSize, setWideSize] = useState<boolean>(true);
  const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
  const [changeRateUSD, setChangeRateUSD] = useState<number>(0);

  const connectBackgroundStream = async () => {
    const port = await chrome.runtime.connect({ name: 'popup' });

    if (port) {
      port.onMessage.addListener(message => {
        if (message.type === 'upbitWebsocketTicker') {
          setTickers(prevTickers => ({
            ...prevTickers,
            [message.data?.code]: { ...prevTickers[message.data?.code], ...message.data },
          }));
        } else if (message.type === 'upbitTickers') {
          setTickers(message.data);
        } else if (message.type === 'changeRateUSD') {
          console.log(message.type, message.data);
          setChangeRateUSD(message.data);
        }
      });

      // 포트 연결 종료 시
      port.onDisconnect.addListener(() => {
        console.log('Disconnected from background');
      });
    }
  };

  useEffect(() => {
    connectBackgroundStream(); // 컴포넌트가 로드될 때 연결 시도
  }, []);
  useEffect(() => {
    setTableData(Object.values(tickers));
  }, [tickers]);

  const columns = useMemo<ColumnDef<Ticker>[]>(
    () => [
      {
        accessorFn: (row: Ticker) => {
          return `${row.korean_name} ${row.market}`;
        },
        id: 'market',
        header: () => {
          return (
            <div className="flex " onClick={() => setCoinNameKR(prev => !prev)}>
              <a href="#" className="mr-[2px] font-bold">
                {coinNameKR ? '한글명' : '영문명'}
              </a>
              <ArrowRightLeft size={10} strokeWidth={3} className="mt-[2px]" />
            </div>
          );
        },
        cell: ({ row }) => {
          const splitMarket = row.original.market?.split('-');
          const convertMarket = splitMarket[1] + '/' + splitMarket[0];
          return (
            <div className="flex flex-col items-start font-semibold">
              <div className="flex gap-[2px] text-left break-word">
                <span>{coinNameKR ? row.original.korean_name : row.original.english_name}</span>
                <div className="flex gap-[1px] items-center">
                  {row.original.market_event.warning && <WarningIcon />}
                  {row.original.market_event.caution && <CautionIcon />}
                </div>
              </div>

              <span className="text-[11px] text-gray-500 font-medium">{convertMarket}</span>
            </div>
          );
        },
        filterFn: (row, filterValue) => {
          if (!filterValue) return true;

          const market = row.original.market.toLowerCase();
          const englishName = row.original.english_name?.toLowerCase() || '';
          const koreanName = row.original.korean_name || '';
          const searchValue = filterValue.toLowerCase().trim();

          // 기존 검색: 전체 텍스트 매칭
          const fullTextMatch =
            market.includes(searchValue) || englishName.includes(searchValue) || koreanName.includes(searchValue);

          let chosungMatch = false;
          const chosungRegex = getRegExp(searchValue, { initialSearch: true });
          chosungMatch = chosungRegex.test(koreanName);

          return fullTextMatch || chosungMatch;
        },
        enableHiding: false,
      },
      {
        accessorKey: 'trade_price',
        header: ({ column }) => {
          return (
            <div className="flex justify-end" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
              <span className="tetx-xs font-bold underline-offset-2 ">현재가</span>
              <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
            </div>
          );
        },
        cell: ({ getValue, row, cell }) => {
          const value = (getValue() as number).toLocaleString();
          const changeRateValue = ((getValue() as number) / changeRateUSD).toLocaleString();
          return (
            <FlashCell key={cell.id} flashKey={cell.id} ticker={row.original}>
              <div className="flex flex-col items-end  font-medium ">
                <span>{value}</span>
                <span className="text-[10px] text-gray-500"> {changeRateUSD > 0 ? `$${changeRateValue}` : ''}</span>
              </div>
            </FlashCell>
          );
        },
        enableHiding: false,
      },
      {
        accessorFn: (row: Ticker) => (row.signed_change_rate * 100).toFixed(2),
        id: 'signed_change_rate',
        header: ({ column }) => {
          return (
            <div
              className="flex justify-end font-bold"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
              <p>전일대비</p>
              <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" />
            </div>
          );
        },
        cell: ({ row, getValue }) => {
          const value = String(getValue() as number);
          const signed_change_price = row.original.signed_change_price.toLocaleString();
          return (
            <div className="flex flex-col items-end font-medium">
              <span
                className={`${row.original.change === 'RISE' ? 'text-red-500' : row.original.change === 'FALL' ? 'text-blue-500' : ''}`}>
                {value}%
              </span>
              <span className="text-[10px] text-gray-500">{signed_change_price}</span>
            </div>
          );
        },
        enableHiding: false,
      },
      {
        accessorFn: (row: Ticker) =>
          (((row.highest_52_week_price - row.trade_price) / row.highest_52_week_price) * 100).toFixed(2),
        id: 'highest_52_week_diff',
        header: ({ column }) => {
          return (
            <div
              className="flex justify-end font-bold"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
              <span>고가대비(52주)</span>
              <ChevronsUpDown className="mt-[1px]" size={12} strokeWidth={3} />
            </div>
          );
        },
        cell: ({ getValue, row }) => {
          const value = String(getValue()) as string;
          const highestPrice = row.original.highest_52_week_price?.toLocaleString();
          return (
            <div className="flex flex-col items-end text-blue-500 font-medium">
              <span>
                <span>-</span>
                {value}%
              </span>
              <span className="text-[10px] text-gray-500">{highestPrice}</span>
            </div>
          );
        },
      },
      {
        accessorFn: (row: Ticker) =>
          (((row.trade_price - row.lowest_52_week_price) / row.lowest_52_week_price) * 100).toFixed(2),
        id: 'lowest_52_week_diff',
        header: ({ column }) => {
          return (
            <div
              className="flex justify-end font-bold"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
              <p>저가대비(52주)</p>
              <ChevronsUpDown className="mt-[1px]" size={12} strokeWidth={3} />
            </div>
          );
        },
        cell: ({ getValue, row }) => {
          const value = String(getValue());
          const lowestPrice = row.original.lowest_52_week_price.toLocaleString();
          return (
            <div className="flex flex-col items-end text-red-500 font-medium">
              <span>
                <span>+</span>
                {value}%
              </span>
              <span className="text-[10px] text-gray-500">{lowestPrice}</span>
            </div>
          );
        },
      },
      {
        accessorFn: (row: Ticker) => row.acc_trade_price_24h / 1_000_000,
        id: 'acc.trade_price_24h',
        header: ({ column }) => {
          return (
            <div
              className="flex justify-end font-bold"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
              <span>거래대금</span>
              <ChevronsUpDown className="mt-[1px]" size={12} strokeWidth={3} />
            </div>
          );
        },
        cell: ({ getValue }) => {
          const value = Math.floor(Number(getValue())).toLocaleString();
          return (
            <div className="flex justify-end font-medium">
              <span>{value}</span>
              <span>백만</span>
            </div>
          );
        },
        enableHiding: false,
      },
    ],
    [coinNameKR],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  });

  useEffect(() => {
    table.getAllColumns().filter(column => column.toggleVisibility(wideSize));
  }, [wideSize]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="como-ui-theme">
      <div className={`flex-col ${!wideSize ? 'w-[420px] h-[430px]' : 'w-[800px] h-[600px]'} overflow-hidden`}>
        <nav className="flex-shrink-0">
          <div className="flex justify-between items-center mx-auto w-full px-1.5 py-1">
            <section>
              <img src={comoLogo} className="size-6" />
            </section>
            <section className="flex gap-1">
              <ModeToggle />
              <SizeToggle wideSize={wideSize} setWideSize={setWideSize} />
            </section>
          </div>
          <div className="flex justify-between mx-auto w-full px-1.5 py-1">
            <section className="relative items-center flex">
              <Input
                className="h-6 w-22 pl-4 py-2 text-[10px] text-neutral-400 font-semibold placeholder:text-neutral-400 border"
                placeholder=" BTC , 비트"
                value={(table.getColumn('market')?.getFilterValue() as string) ?? ''}
                onChange={event => table.getColumn('market')?.setFilterValue(event.target.value)}
              />
              <Search className="absolute size-3 left-1 top-1.5 text-neutral-500 pointer-events-none" />
            </section>
            <section>
              <MarketDropdown />
            </section>
          </div>
        </nav>

        <main
          className={`flex-1 ${!wideSize ? 'h-[365px]' : 'h-[535px]'} overflow-y-scroll light-scrollbar dark-scrollbar`}>
          <Table className="table table-fixed text-xs">
            <TableHeader className="sticky top-0 z-0 h-7.5 text-[10px] font-extrabold bg-zinc-50 dark:bg-zinc-800">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id} className="h-7.5 border-transparent text-stone-800 dark:text-gray-400">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map(row => (
                  <TableRow className="border-transparent" key={row.id} data-state={row.getIsSelected() && 'selected'}>
                    {row
                      .getVisibleCells()
                      .map(cell =>
                        cell.column.id === 'trade_price' ? (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        ) : (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ),
                      )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </main>
      </div>
    </ThemeProvider>
  );
};

export default App;
