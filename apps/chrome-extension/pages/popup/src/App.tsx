import { useState, useEffect, useMemo } from 'react';
import '@/styles/App.css';
import {
  UpbitTicker,
  BithumbTicker,
  BinanceTicker,
  BinanceWebsocketTicker,
  ExchangePlatform,
  MarketType,
  FavoriteCoins,
} from '@/types';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  VisibilityState,
  RowPinningState,
  useReactTable,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getUpbitColumns } from '@/columns/upbitColumns';
import { getBithumbColumns } from '@/columns/bithumbColumns';
import { getBinanceColumns } from '@/columns/binanceColumns';
import { ThemeProvider } from '@/components/ThemeProvider';
import { LoadingSpinner } from '@/components/ui/loadingSpinner';
import { Input } from '@/components/ui/input';
import { ModeToggle } from '@/components/ModeToggle';
import { SizeToggle } from '@/components/SizeToggle';
import { MarketDropdown } from '@/components/MarketDropdown';
import { MarketTypeDropDown } from '@/components/MarketTypeDropDown';
import { UpdateNoteToggle } from '@/components/UpdateNoteToggle';
import { FavoriteToggle } from '@/components/FavoriteToggle';
import { Search } from 'lucide-react';
import comoLogo from '@/assets/icons/como-logo.png';

// 타입 정의
type TickerTypes = UpbitTicker | BithumbTicker | BinanceTicker;
const fallbackData: TickerTypes[] = [];

const usePort = (
  setTickers: React.Dispatch<React.SetStateAction<{ [key: string]: TickerTypes }>>,
  setExchangePlatform: React.Dispatch<React.SetStateAction<ExchangePlatform>>,
  setExchangeRateUSD: React.Dispatch<React.SetStateAction<number>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  updatedVersionHandler: (data: string) => void,
) => {
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'popup' });
    let isInitialLoad = true;

    port.onMessage.addListener(({ type, data }) => {
      switch (type) {
        case 'upbitWebsocketTicker':
        case 'bithumbWebsocketTicker':
          setTickers(prev => ({ ...prev, [data?.code]: { ...prev[data?.code], ...data } }));
          break;
        case 'binanceWebsocketTicker':
          setTickers(prev => {
            const updateTickers = { ...prev };
            data.forEach((ticker: { s: string } & BinanceWebsocketTicker) => {
              if (ticker.s) {
                updateTickers[ticker.s] = { ...updateTickers[ticker.s], ...ticker };
              }
            });
            return updateTickers;
          });
          break;
        case 'upbitTickers':
        case 'bithumbTickers':
        case 'binanceTickers':
          setTickers({});
          setTickers(data);
          setIsLoading(false);
          break;
        case 'activeExchange':
          setExchangePlatform(data);
          break;
        case 'exchangeRateUSD':
          if (isInitialLoad) {
            setExchangeRateUSD(data);
            isInitialLoad = false;
          }
          break;
        case 'updatedVersion':
          updatedVersionHandler(data);
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      setIsLoading(true);
      setTickers({});
      setTimeout(() => chrome.runtime.connect({ name: 'popup' }), 500);
    });

    chrome.runtime.sendMessage({ action: 'getActiveExchange' });

    return () => port.disconnect();
  }, [setTickers, setExchangePlatform, setExchangeRateUSD, setIsLoading]);
};

const useFavorites = () => {
  const [favoriteCoins, setFavoriteCoins] = useState<FavoriteCoins>({ upbit: [], bithumb: [], binance: [] });

  useEffect(() => {
    chrome.storage.local.get('favoriteCoins', result => {
      const stored = result?.favoriteCoins || { upbit: [], bithumb: [], binance: [] };
      setFavoriteCoins(stored);
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.set({
      favoriteCoins: favoriteCoins,
    });
  }, [favoriteCoins]);

  return [favoriteCoins, setFavoriteCoins] as const;
};

const useWideSize = () => {
  const [wideSize, setWideSize] = useState<boolean>(false);

  useEffect(() => {
    chrome.storage.local.get('wideSize', result => {
      const stored = result?.wideSize || false;
      setWideSize(stored);
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.set({ wideSize: wideSize });
  }, [wideSize]);

  return [wideSize, setWideSize] as const;
};

const App = () => {
  const [tickers, setTickers] = useState<{ [key: string]: TickerTypes }>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowPinning, setRowPinning] = useState<RowPinningState>({ top: [], bottom: [] });
  const [wideSize, setWideSize] = useWideSize();
  const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
  const [exchangeRateUSD, setExchangeRateUSD] = useState<number>(0);
  const [exchangeMarketType, setExchangeMarketType] = useState<MarketType>('KRW');
  const [exchangePlatform, setExchangePlatform] = useState<ExchangePlatform>('upbit');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [favoriteFunc, setFavoriteFunc] = useState<boolean>(true);
  const [updatedVersion, setUpdatedVersion] = useState<string>('');
  const [favoriteCoins, setFavoriteCoins] = useFavorites();

  const updatedVersionHandler = (newVersion: string) => {
    chrome.storage.local.get('updatedVersion', result => {
      const stored = result?.updatedVersion || '';

      if (stored !== newVersion) {
        setUpdatedVersion(newVersion);
      }
    });
  };
  useEffect(() => {
    chrome.runtime.sendMessage('popupOpened');
  }, []);

  usePort(setTickers, setExchangePlatform, setExchangeRateUSD, setIsLoading, updatedVersionHandler);

  const tableData = useMemo<TickerTypes[]>(() => {
    if (!Object.values(tickers).length) return fallbackData;

    switch (exchangePlatform) {
      case 'upbit':
        return Object.values(tickers).filter(
          (ticker): ticker is UpbitTicker => 'market' in ticker && ticker.market?.startsWith(`${exchangeMarketType}-`),
        );
      case 'bithumb':
        return Object.values(tickers).filter(
          (ticker): ticker is BithumbTicker =>
            'market' in ticker && ticker.market?.startsWith(`${exchangeMarketType}-`),
        );
      case 'binance':
        return Object.values(tickers).filter(
          (ticker): ticker is BinanceTicker => 'symbol' in ticker && ticker.symbol?.endsWith(`${exchangeMarketType}`),
        );
      default:
        return fallbackData;
    }
  }, [tickers, exchangePlatform, exchangeMarketType]);

  const specificMarketType = useMemo(() => {
    if (exchangePlatform === 'binance') {
      return exchangeMarketType === 'KRW' ? 'USDT' : exchangeMarketType;
    }
    return exchangeMarketType;
  }, [exchangePlatform, exchangeMarketType]);

  const columns = useMemo<ColumnDef<TickerTypes>[]>(() => {
    switch (exchangePlatform) {
      case 'upbit':
        return getUpbitColumns(
          coinNameKR,
          setCoinNameKR,
          exchangeRateUSD,
          exchangeMarketType,
          favoriteCoins,
          setFavoriteCoins,
          favoriteFunc,
        ) as ColumnDef<TickerTypes>[];
      case 'bithumb':
        return getBithumbColumns(
          coinNameKR,
          setCoinNameKR,
          exchangeRateUSD,
          exchangeMarketType,
          favoriteCoins,
          setFavoriteCoins,
          favoriteFunc,
        ) as ColumnDef<TickerTypes>[];
      case 'binance':
        return getBinanceColumns(
          specificMarketType,
          favoriteCoins,
          setFavoriteCoins,
          favoriteFunc,
          setSorting,
        ) as ColumnDef<TickerTypes>[];
    }
  }, [coinNameKR, exchangeRateUSD, exchangeMarketType, favoriteCoins, exchangePlatform, favoriteFunc]);

  const table = useReactTable<TickerTypes>({
    data: tableData,
    columns: columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowPinningChange: setRowPinning,
    state: { sorting, columnFilters, columnVisibility, rowPinning },
    initialState: { sorting: [{ id: 'trade_price', desc: true }] },
    enableRowPinning: favoriteFunc, // favoriteFunc에 따라 행 고정 활성화
    keepPinnedRows: true, // 필터링/페이지네이션에도 고정 유지
    debugRows: true,
  });

  // favoriteCoins와 rowPinning 동기화
  useEffect(() => {
    if (isLoading || !favoriteFunc) {
      table.resetRowPinning(true); // 로딩 중이거나 favoriteFunc 꺼지면 초기화
      return;
    }

    const rows = table.getRowModel().rows;
    if (!rows.length) {
      table.resetRowPinning(true);
      return;
    }

    rows.forEach(row => {
      const market = row.original.market;
      const shouldPin = favoriteCoins[exchangePlatform].includes(market);
      const isPinned = row.getIsPinned();

      if (shouldPin && !isPinned) {
        row.pin('top'); // 즐겨찾기에 있으면 상단 고정
      } else if (!shouldPin && isPinned) {
        row.pin(false); // 즐겨찾기에서 없으면 고정 해제
      }
    });
  }, [isLoading, exchangeMarketType, exchangePlatform, favoriteCoins, favoriteFunc, table]);

  useEffect(() => {
    table.getAllColumns().forEach(column => column.toggleVisibility(wideSize));
  }, [wideSize, exchangePlatform]);

  return (
    <ThemeProvider defaultTheme="light" storageKey="como-ui-theme">
      <div className={`flex-col ${wideSize ? 'w-[800px] h-[600px]' : 'w-[420px] h-[430px]'} overflow-hidden`}>
        <nav className="flex-shrink-0 p-1">
          <div className="flex justify-between items-center mx-auto w-full">
            <section>
              <img src={comoLogo} className="size-6 m-1 ml-0" />
            </section>
            <section className="flex gap-1">
              <UpdateNoteToggle updatedVersion={updatedVersion} />
              <FavoriteToggle favoriteFunc={favoriteFunc} setFavoriteFunc={setFavoriteFunc} />
              <ModeToggle />
              <SizeToggle wideSize={wideSize} setWideSize={setWideSize} />
            </section>
          </div>
          <div className="flex justify-between mx-auto w-full px-1 py-1">
            <section className="flex gap-1">
              <MarketDropdown
                exchangePlatform={exchangePlatform}
                setExchangePlatform={setExchangePlatform}
                setIsLoading={setIsLoading}
                setTickers={setTickers}
                setRowPinning={setRowPinning}
              />
              <MarketTypeDropDown
                exchangePlatform={exchangePlatform}
                exchangeMarketType={exchangeMarketType}
                setExchangeMarketType={setExchangeMarketType}
                setRowPinning={setRowPinning}
              />
              <div className="relative flex justify-center items-center h-6 w-15 text-[10px] gap-1 border-transparent border-1 rounded-md group hover:cursor-default">
                <span>Total</span>
                <span className="w-[17px]">{table.getRowModel().rows.length}</span>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[9999]">
                  {'현재 거래소 종목수'}
                </span>
              </div>
              <div className="relative flex justify-center items-center h-6 w-14 text-[10px] gap-1 border-transparent border-1 rounded-md group hover:cursor-default ">
                <span>
                  {exchangeRateUSD}
                  <span className="text-neutral-400"> KRW</span>
                </span>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[9999]">
                  {'한국수출입은행 고시 환율'}
                </span>
              </div>
            </section>
            <section className="relative items-center flex">
              <Input
                className="h-6 w-30 pl-4 py-2 text-[10px] text-neutral-400 placeholder:text-neutral-400 border"
                placeholder=" BTC , 비트"
                value={(table.getColumn('market')?.getFilterValue() as string) ?? ''}
                onChange={event => table.getColumn('market')?.setFilterValue(event.target.value)}
              />
              <Search className="absolute size-[11px] left-1 top-[7px] text-neutral-500 pointer-events-none" />
            </section>
          </div>
        </nav>
        <main
          className={`flex-1 ${wideSize ? 'h-[535px]' : 'h-[365px]'} overflow-y-scroll light-scrollbar dark-scrollbar`}>
          <Table className="table table-fixed text-xs">
            <TableHeader className="sticky top-0 z-49 h-7.5 text-[10px] font-extrabold bg-zinc-200 dark:bg-zinc-800">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead
                      key={header.id}
                      className="h-7.5 border-transparent text-stone-800 dark:text-gray-400 hover:cursor-pointer">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading || !Object.keys(tickers).length ? (
                <TableRow>
                  <TableCell
                    colSpan={table.getAllColumns().filter(col => col.getIsVisible()).length || 1}
                    className="h-48 text-center">
                    <LoadingSpinner />
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {table.getTopRows()?.map(row => (
                    <TableRow
                      className="border-transparent sticky bg-gray-100 dark:bg-gray-800 z-48"
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}>
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {table.getCenterRows()?.map(row => (
                    <TableRow
                      className="border-transparent"
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}>
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </main>
      </div>
    </ThemeProvider>
  );
};

export default App;
