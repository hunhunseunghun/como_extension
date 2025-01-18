import { useState, useEffect, useMemo, useRef } from 'react';
import '@/styles/App.css';
import { Ticker } from '@/types';
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
import { ThemeProvider } from '@/components/ThemeProvider';
import { LoadingSpinner } from '@/components/ui/loadingSpinner';
import { Input } from '@/components/ui/input';
import { ModeToggle } from '@/components/ModeToggle';
import { SizeToggle } from '@/components/SizeToggle';
import { MarketDropdown } from '@/components/MarketDropdown';
import { MarketTypeDropDown } from '@/components/MarketTypeDropDown';
import { UpdateNoteToggle } from '@/components/UpdateNoteToggle';
import { FavoriteToggle } from '@/components/FavoriteToggle';
import { Search, Loader2 } from 'lucide-react';
import comoLogo from '@/assets/icons/como-logo.png';

// 컴포넌트 외부에서 안정적인 fallback 데이터 정의
const fallbackData: Ticker[] = [];

const App = () => {
  const [tickers, setTickers] = useState<{ [key: string]: Ticker }>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowPinning, setRowPinning] = useState<RowPinningState>({ top: [], bottom: [] });
  const [wideSize, setWideSize] = useState<boolean>(true);
  const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
  const [exchangeRateUSD, setExchangeRateUSD] = useState<number>(0);
  const [exchangeMarketType, setExchangeMarketType] = useState<'KRW' | 'BTC' | 'USDT'>('KRW');
  const [exchangePlatform, setExchangePlatform] = useState<'upbit' | 'bithumb'>('upbit');
  const [isLoading, setIsLoading] = useState(true);
  const [favoriteCoins, setFavoriteCoins] = useState<{ upbit: string[]; bithumb: string[] }>({
    upbit: [],
    bithumb: [],
  });
  const [favoriteFunc, setFavoriteFunc] = useState(true);

  // rowPinning 초기화
  useEffect(() => {
    console.log('Resetting rowPinning due to market/platform change:', { exchangePlatform, exchangeMarketType });
    setRowPinning({ top: [], bottom: [] });
  }, [exchangeMarketType, exchangePlatform]);

  // 모든 테이블 데이터에 대해 안정적인 참조를 제공
  const tableDataUpbitKRW = useMemo(() => {
    if (!Object.values(tickers).length) return fallbackData;
    if (exchangePlatform === 'upbit') {
      const filtered = Object.values(tickers).filter(ticker => ticker.market?.startsWith('KRW-'));
      console.log('tableDataUpbitKRW:', filtered);
      return filtered;
    }
    return fallbackData;
  }, [tickers, exchangePlatform]);

  const tableDataUpbitBTC = useMemo(() => {
    if (!Object.values(tickers).length) return fallbackData;
    if (exchangePlatform === 'upbit') {
      const filtered = Object.values(tickers).filter(ticker => ticker.market?.startsWith('BTC-'));
      console.log('tableDataUpbitBTC:', filtered);
      return filtered;
    }
    return fallbackData;
  }, [tickers, exchangePlatform]);

  const tableDataUpbitUSDT = useMemo(() => {
    if (!Object.values(tickers).length) return fallbackData;
    if (exchangePlatform === 'upbit') {
      const filtered = Object.values(tickers).filter(ticker => ticker.market?.startsWith('USDT-'));
      console.log('tableDataUpbitUSDT:', filtered);
      return filtered;
    }
    return fallbackData;
  }, [tickers, exchangePlatform]);

  const tableDataBithumbKRW = useMemo(() => {
    if (!Object.values(tickers).length) return fallbackData;
    if (exchangePlatform === 'bithumb') {
      const filtered = Object.values(tickers).filter(ticker => ticker.market?.startsWith('KRW-'));
      console.log('tableDataBithumbKRW:', filtered);
      return filtered;
    }
    return fallbackData;
  }, [tickers, exchangePlatform]);

  const tableDataBithumbBTC = useMemo(() => {
    if (!Object.values(tickers).length) return fallbackData;
    if (exchangePlatform === 'bithumb') {
      const filtered = Object.values(tickers).filter(ticker => ticker.market?.startsWith('BTC-'));
      console.log('tableDataBithumbBTC:', filtered);
      return filtered;
    }
    return fallbackData;
  }, [tickers, exchangePlatform]);

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const connectBackgroundStream = () => {
    if (portRef.current) return;
    const port = chrome.runtime.connect({ name: 'popup' });
    portRef.current = port;
    try {
      port.onMessage.addListener(message => {
        const { type, data } = message;
        switch (type) {
          case 'upbitWebsocketTicker':
            setTickers(prev => ({ ...prev, [data?.code]: { ...prev[data?.code], ...data } }));
            if (isLoading) setIsLoading(false);
            break;
          case 'bithumbWebsocketTicker':
            setTickers(prev => ({ ...prev, [data?.code]: { ...prev[data?.code], ...data } }));
            if (isLoading) setIsLoading(false);
            break;
          case 'upbitTickers':
            console.log('Received upbitTickers:', data);
            setTickers(data);
            if (isLoading) setIsLoading(false);
            break;
          case 'bithumbTickers':
            console.log('Received bithumbTickers:', data);
            setTickers(data);
            if (isLoading) setIsLoading(false);
            break;
          case 'exchangeRateUSD':
            setExchangeRateUSD(data);
            break;
          case 'activeExchange':
            setExchangePlatform(data);
            break;
          default:
            break;
        }
      });
      port.onDisconnect.addListener(() => {
        portRef.current = null;
        setIsLoading(true);
        console.warn('WebSocket disconnected, reconnecting...');
        setTimeout(() => connectBackgroundStream(), 1000);
      });
    } catch (error) {
      console.error('Failed to connect to background:', error);
    }
  };

  useEffect(() => {
    connectBackgroundStream();
    chrome.runtime.sendMessage({ action: 'getActiveExchange' });
    chrome.storage.local.get('como_extension', result => {
      const storageFavoriteCoins = result?.como_extension?.favoriteCoins;
      if (storageFavoriteCoins) setFavoriteCoins({ ...storageFavoriteCoins });
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get('como_extension', result => {
      const storageFavoriteCoins = result?.como_extension?.favoriteCoins?.[exchangePlatform];
      if (storageFavoriteCoins) {
        setFavoriteCoins(prev => ({ ...prev, [exchangePlatform]: [...storageFavoriteCoins] }));
      }
    });
  }, [exchangePlatform]);

  useEffect(() => {
    chrome.storage.local.get('como_extension', result => {
      const comoStorage = result?.como_extension?.favoriteCoins || { upbit: [], bithumb: [] };
      comoStorage[exchangePlatform] = [...favoriteCoins[exchangePlatform]];
      chrome.storage.local.set({
        como_extension: { ...result.como_extension, favoriteCoins: comoStorage },
      });
    });
  }, [favoriteCoins]);

  // tickers 변경 시 rowPinning 동기화
  useEffect(() => {
    const selectedTable = renderSelectedTable(exchangePlatform, exchangeMarketType);
    const rows = selectedTable.getRowModel().rows;
    const validPinnedRows: string[] = [];

    // rowPinning.top이 undefined일 경우 빈 배열로 처리
    (rowPinning.top ?? []).forEach(rowId => {
      if (rows.some(row => row.id === rowId)) {
        validPinnedRows.push(rowId);
      }
    });

    // favoriteCoins에 따라 새로운 핀 추가
    rows.forEach(row => {
      const market = row.original.market;
      if (favoriteCoins[exchangePlatform].includes(market) && !validPinnedRows.includes(row.id)) {
        validPinnedRows.push(row.id);
      }
    });

    // 길이 비교 시에도 undefined 방지
    if (validPinnedRows.length !== (rowPinning.top ?? []).length) {
      console.log('Updating rowPinning due to data change:', validPinnedRows);
      setRowPinning(prev => ({ ...prev, top: validPinnedRows }));
    }
  }, [tickers, favoriteCoins, exchangePlatform, exchangeMarketType]);

  const upbitColumns = useMemo(
    () =>
      getUpbitColumns(
        coinNameKR,
        setCoinNameKR,
        exchangeRateUSD,
        exchangeMarketType,
        favoriteCoins,
        setFavoriteCoins,
        'upbit',
      ),
    [coinNameKR, exchangeRateUSD, exchangeMarketType, favoriteCoins],
  );

  const bithumbColumns = useMemo(
    () =>
      getBithumbColumns(
        coinNameKR,
        setCoinNameKR,
        exchangeRateUSD,
        exchangeMarketType,
        favoriteCoins,
        setFavoriteCoins,
        'bithumb',
      ),
    [coinNameKR, exchangeRateUSD, exchangeMarketType, favoriteCoins],
  );

  const columns: ColumnDef<Ticker>[] = useMemo(() => {
    if (exchangePlatform === 'upbit') {
      return upbitColumns;
    } else if (exchangePlatform === 'bithumb') {
      return bithumbColumns;
    }
    return [];
  }, [exchangePlatform, upbitColumns, bithumbColumns]);

  const tableUpbitKRW = useReactTable({
    data: tableDataUpbitKRW,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowPinningChange: setRowPinning,
    state: { sorting, columnFilters, columnVisibility, rowPinning },
    initialState: { sorting: [{ id: 'trade_price', desc: true }] },
    debugRows: true,
  });

  const tableUpbitBTC = useReactTable({
    data: tableDataUpbitBTC,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowPinningChange: setRowPinning,
    state: { sorting, columnFilters, columnVisibility, rowPinning },
    initialState: { sorting: [{ id: 'trade_price', desc: true }] },
    debugRows: true,
  });

  const tableUpbitUSDT = useReactTable({
    data: tableDataUpbitUSDT,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowPinningChange: setRowPinning,
    state: { sorting, columnFilters, columnVisibility, rowPinning },
    initialState: { sorting: [{ id: 'trade_price', desc: true }] },
    debugRows: true,
  });

  const tableBithumbKRW = useReactTable({
    data: tableDataBithumbKRW,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowPinningChange: setRowPinning,
    state: { sorting, columnFilters, columnVisibility, rowPinning },
    initialState: { sorting: [{ id: 'trade_price', desc: true }] },
    debugRows: true,
  });

  const tableBithumbBTC = useReactTable({
    data: tableDataBithumbBTC,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowPinningChange: setRowPinning,
    state: { sorting, columnFilters, columnVisibility, rowPinning },
    initialState: { sorting: [{ id: 'trade_price', desc: true }] },
    debugRows: true,
  });

  const renderSelectedTable = (platform: 'upbit' | 'bithumb', marketType: 'KRW' | 'BTC' | 'USDT') => {
    console.log('KEY :: ', `${platform}${marketType}`);
    const key = `${platform}${marketType}`;
    switch (key) {
      case 'upbitKRW':
        return tableUpbitKRW;
      case 'upbitBTC':
        return tableUpbitBTC;
      case 'upbitUSDT':
        return tableUpbitUSDT;
      case 'bithumbKRW':
        return tableBithumbKRW;
      case 'bithumbBTC':
        return tableBithumbBTC;

      default:
        console.warn(`Unknown table key, defaulting to empty table: ${key}`);
        return tableUpbitKRW;
    }
  };

  useEffect(() => {
    const selectedTable = renderSelectedTable(exchangePlatform, exchangeMarketType);
    selectedTable.getAllColumns().forEach(column => column.toggleVisibility(wideSize));
  }, [wideSize, exchangePlatform, exchangeMarketType]);

  useEffect(() => {
    const selectedTable = renderSelectedTable(exchangePlatform, exchangeMarketType);
    console.log('Current table data:', selectedTable.getRowModel().rows);
    console.log('Current rowPinning:', rowPinning);
  }, [rowPinning, exchangePlatform, exchangeMarketType]);

  const topRows = () => {
    try {
      return renderSelectedTable(exchangePlatform, exchangeMarketType).getTopRows();
    } catch (e) {
      console.error('Error in getTopRows:', e);
      return [];
    }
  };
  topRows();

  return (
    <ThemeProvider defaultTheme="dark" storageKey="como-ui-theme">
      <div className={`flex-col ${!wideSize ? 'w-[420px] h-[430px]' : 'w-[800px] h-[600px]'} overflow-hidden`}>
        <nav className="flex-shrink-0">
          <div className="flex justify-between items-center mx-auto w-full px-1.5 py-1">
            <section>
              <img src={comoLogo} className="size-6" />
            </section>
            <section className="flex gap-1">
              <div className="relative flex justify-center items-center h-6 w-16 mr-2 text-[10px] gap-1 border-1 rounded-md hover:cursor-pointer group">
                <span>{isLoading ? '-' : exchangeRateUSD}원</span>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[9999]">
                  {'한국수출입은행 고시 환율'}
                </span>
              </div>
              <UpdateNoteToggle />
              <FavoriteToggle favoriteFunc={favoriteFunc} setFavoriteFunc={setFavoriteFunc} />
              <ModeToggle />
              <SizeToggle wideSize={wideSize} setWideSize={setWideSize} />
            </section>
          </div>
          <div className="flex justify-between mx-auto w-full px-1.5 py-1">
            <section className="relative items-center flex">
              <Input
                className="h-6 w-22 pl-4 py-2 text-[10px] text-neutral-400 placeholder:text-neutral-400 border"
                placeholder=" BTC , 비트"
                value={
                  (renderSelectedTable(exchangePlatform, exchangeMarketType)
                    .getColumn('market')
                    ?.getFilterValue() as string) ?? ''
                }
                onChange={event =>
                  renderSelectedTable(exchangePlatform, exchangeMarketType)
                    .getColumn('market')
                    ?.setFilterValue(event.target.value)
                }
              />
              <Search className="absolute size-[11px] left-1 top-[7px] text-neutral-500 pointer-events-none" />
            </section>
            <section className="flex gap-1">
              <div className="flex justify-center items-center h-6 w-18 text-[10px] gap-1 border-1 rounded-md">
                {!isLoading && <span>Total</span>}
                <span>
                  {isLoading ? (
                    <Loader2 className="size-3 animate-spin text-gray-500" />
                  ) : (
                    renderSelectedTable(exchangePlatform, exchangeMarketType).getRowModel().rows.length
                  )}
                </span>
              </div>
              <MarketDropdown
                exchangePlatform={exchangePlatform}
                setExchangePlatform={setExchangePlatform}
                setIsLoading={setIsLoading}
                setTickers={setTickers}
              />
              <MarketTypeDropDown
                exchangePlatform={exchangePlatform}
                exchangeMarketType={exchangeMarketType}
                setExchangeMarketType={setExchangeMarketType}
              />
            </section>
          </div>
        </nav>
        <main
          className={`flex-1 ${!wideSize ? 'h-[365px]' : 'h-[535px]'} overflow-y-scroll light-scrollbar dark-scrollbar`}>
          <Table className="table table-fixed text-xs">
            <TableHeader className="sticky top-0 z-0 h-7.5 text-[10px] font-extrabold bg-zinc-50 dark:bg-zinc-800">
              {renderSelectedTable(exchangePlatform, exchangeMarketType)
                .getHeaderGroups()
                .map(headerGroup => (
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
                    colSpan={
                      renderSelectedTable(exchangePlatform, exchangeMarketType)
                        .getAllColumns()
                        .filter(col => col.getIsVisible()).length || 1
                    }
                    className="h-48 text-center">
                    <LoadingSpinner />
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {renderSelectedTable(exchangePlatform, exchangeMarketType)
                    .getTopRows()
                    .map(row => (
                      <TableRow
                        className="border-transparent sticky bg-gray-100 dark:bg-gray-800 z-10"
                        key={row.id}
                        data-state={row.getIsSelected() && 'selected'}>
                        {row.getVisibleCells().map(cell => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {renderSelectedTable(exchangePlatform, exchangeMarketType)
                    .getCenterRows()
                    .map(row => (
                      <TableRow
                        className="border-transparent"
                        key={row.id}
                        data-state={row.getIsSelected() && 'selected'}>
                        {row.getVisibleCells().map(cell => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
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
//==============================================================================================================================================

// import { useState, useEffect, useMemo, useRef } from 'react';
// import '@/styles/App.css';
// import { Ticker } from '@/types';
// //table
// import {
//   ColumnDef,
//   ColumnFiltersState,
//   SortingState,
//   getCoreRowModel,
//   getSortedRowModel,
//   getFilteredRowModel,
//   flexRender,
//   VisibilityState,
//   RowPinningState,
//   useReactTable,
// } from '@tanstack/react-table';
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
// //market columns
// import { getUpbitColumns } from '@/columns/upbitColumns';
// import { getBithumbColumns } from '@/columns/bithumbColumns';
// //components
// import { ThemeProvider } from '@/components/ThemeProvider';
// import { LoadingSpinner } from '@/components/ui/loadingSpinner';
// import { Input } from '@/components/ui/input';
// import { ModeToggle } from '@/components/ModeToggle';
// import { SizeToggle } from '@/components/SizeToggle';
// import { MarketDropdown } from '@/components/MarketDropdown';
// // import FlashCell from '@/components/FlashCell';
// import { MarketTypeDropDown } from '@/components/MarketTypeDropDown';
// import { UpdateNoteToggle } from '@/components/UpdateNoteToggle';
// import { FavoriteToggle } from '@/components/FavoriteToggle';
// //icons
// import { Search } from 'lucide-react';
// import comoLogo from '@/assets/icons/como-logo.png';

// const App = () => {
//   const [tickers, setTickers] = useState<{ [key: string]: Ticker }>({});
//   //table states
//   const [sorting, setSorting] = useState<SortingState>([]);
//   const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
//   const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
//   const [rowPinning, setRowPinning] = useState<RowPinningState>({
//     top: [],
//     bottom: [],
//   });

//   const [wideSize, setWideSize] = useState<boolean>(true);
//   const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
//   const [exchangeRateUSD, setExchangeRateUSD] = useState<number>(0);
//   const [exchangeMarketType, setExchangeMarketType] = useState<'KRW' | 'BTC' | 'USDT'>('KRW');
//   const [exchangePlatform, setExchangePlatform] = useState<'upbit' | 'bithumb'>('upbit'); // 'coinone' | 'binance'
//   const [isLoading, setIsLoading] = useState(true);
//   const [favoriteCoins, setFavoriteCoins] = useState<{ upbit: string[]; bithumb: string[] }>({
//     upbit: [],
//     bithumb: [],
//   }); // market: timestamp

//   const [favoriteFunc, setFavoriteFunc] = useState(true);

//   // rowPinning 초기화
//   useEffect(() => {
//     console.log('Resetting rowPinning due to market/platform change:', { exchangePlatform, exchangeMarketType });
//     setRowPinning({ top: [], bottom: [] });
//   }, [exchangeMarketType, exchangePlatform]);

//   const tableData = useMemo(() => {
//     if (!Object.values(tickers).length) return [];
//     const filteredData = Object.values(tickers).filter(ticker => ticker.market?.startsWith(`${exchangeMarketType}-`));
//     return filteredData;
//   }, [tickers, exchangeMarketType]);

//   const portRef = useRef<chrome.runtime.Port | null>(null);
//   const connectBackgroundStream = () => {
//     if (portRef.current) return;
//     const port = chrome.runtime.connect({ name: 'popup' });
//     portRef.current = port;
//     try {
//       port.onMessage.addListener(message => {
//         const { type, data } = message;

//         switch (type) {
//           case 'upbitWebsocketTicker':
//             setTickers(prevTickers => ({
//               ...prevTickers,
//               [data?.code]: { ...prevTickers[data?.code], ...data },
//             }));
//             if (isLoading) {
//               setIsLoading(false);
//             }
//             break;

//           case 'bithumbWebsocketTicker':
//             setTickers(prevTickers => ({ ...prevTickers, [data?.code]: { ...prevTickers[data?.code], ...data } }));
//             if (isLoading) {
//               setIsLoading(false);
//             }
//             break;

//           case 'upbitTickers':
//             setTickers(data);
//             if (isLoading) {
//               setIsLoading(false);
//             }
//             break;

//           case 'bithumbTickers':
//             setTickers(data);
//             if (isLoading) {
//               setIsLoading(false);
//             }
//             break;

//           case 'exchangeRateUSD':
//             setExchangeRateUSD(data);
//             break;

//           case 'activeExchange':
//             setExchangePlatform(data);
//             break;

//           default:
//         }
//       });

//       port.onDisconnect.addListener(() => {
//         portRef.current = null;
//         setIsLoading(true);
//         setTimeout(() => connectBackgroundStream(), 1000);
//       });
//     } catch (error) {
//       console.error('Failed to connect to background:', error);
//     }
//   };

//   useEffect(() => {
//     // 백그라운드 스트림 연결
//     connectBackgroundStream();
//     // 활성화 거래소
//     chrome.runtime.sendMessage({ action: 'getActiveExchange' });
//     // 즐겨찾기 초기값
//     chrome.storage.local.get('como_extension', result => {
//       const storageFavoriteCoins = result?.como_extension?.favoriteCoins;
//       if (storageFavoriteCoins) {
//         setFavoriteCoins({ ...storageFavoriteCoins });
//       }
//     });
//   }, []);

//   useEffect(() => {
//     chrome.storage.local.get('como_extension', result => {
//       const storageFavoriteCoins = result?.como_extension?.['favoriteCoins']?.[exchangePlatform];

//       if (storageFavoriteCoins) {
//         setFavoriteCoins(prev => {
//           const updatedCoins = { ...prev };
//           updatedCoins[exchangePlatform] = [...storageFavoriteCoins];
//           return updatedCoins;
//         });
//       }
//     });
//   }, [exchangePlatform]);

//   useEffect(() => {
//     // 즐겨찾기 데이터 저장
//     chrome.storage.local.get('como_extension', result => {
//       const comoStorage = result?.como_extension?.favoriteCoins || { upbit: [], bithumb: [] };
//       if (!comoStorage[exchangePlatform]) {
//         comoStorage[exchangePlatform] = [];
//       }

//       comoStorage[exchangePlatform] = [...favoriteCoins[exchangePlatform]];

//       console.log('comostorage popup:', comoStorage);
//       chrome.storage.local.set({
//         como_extension: {
//           ...result.como_extension,
//           favoriteCoins: comoStorage,
//         },
//       });
//     });
//   }, [favoriteCoins]);

//   const columns: ColumnDef<Ticker>[] = useMemo(() => {
//     if (exchangePlatform === 'upbit') {
//       return getUpbitColumns(
//         coinNameKR,
//         setCoinNameKR,
//         exchangeRateUSD,
//         exchangeMarketType,
//         favoriteCoins,
//         setFavoriteCoins,
//         exchangePlatform,
//       );
//     } else if (exchangePlatform === 'bithumb') {
//       return getBithumbColumns(
//         coinNameKR,
//         setCoinNameKR,
//         exchangeRateUSD,
//         exchangeMarketType,
//         favoriteCoins,
//         setFavoriteCoins,
//         exchangePlatform,
//       );
//     }
//     return [];
//   }, [coinNameKR, exchangeRateUSD, exchangeMarketType, exchangePlatform, favoriteCoins]);

//   const table = useReactTable({
//     data: tableData,
//     columns,
//     getCoreRowModel: getCoreRowModel(),
//     getSortedRowModel: getSortedRowModel(),
//     getFilteredRowModel: getFilteredRowModel(),
//     onSortingChange: setSorting,
//     onColumnFiltersChange: setColumnFilters,
//     onColumnVisibilityChange: setColumnVisibility,
//     onRowPinningChange: setRowPinning,
//     state: {
//       sorting,
//       columnFilters,
//       columnVisibility,
//       rowPinning,
//     },
//     initialState: {
//       sorting: [{ id: 'trade_price', desc: true }],
//     },
//     debugRows: true,
//   });

//   useEffect(() => {
//     table.getAllColumns().filter(column => column.toggleVisibility(wideSize));
//   }, [wideSize]);

//   return (
//     <ThemeProvider defaultTheme="dark" storageKey="como-ui-theme">
//       <div className={`flex-col ${!wideSize ? 'w-[420px] h-[430px]' : 'w-[800px] h-[600px]'} overflow-hidden`}>
//         <nav className="flex-shrink-0">
//           <div className="flex justify-between items-center mx-auto w-full px-1.5 py-1">
//             <section>
//               <img src={comoLogo} className="size-6" />
//             </section>

//             <section className="flex gap-1">
//               <div className="relative flex justify-center items-center h-6 w-16 mr-2 text-[10px]  gap-1 border-1 rounded-md hover:cursor-pointer group">
//                 <span>{isLoading ? '-' : exchangeRateUSD}원</span>
//                 <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[9999]">
//                   {'한국수출입은행 고시 환율'}
//                 </span>
//               </div>
//               <UpdateNoteToggle />
//               <FavoriteToggle favoriteFunc={favoriteFunc} setFavoriteFunc={setFavoriteFunc} />
//               <ModeToggle />
//               <SizeToggle wideSize={wideSize} setWideSize={setWideSize} />
//             </section>
//           </div>
//           <div className="flex justify-between mx-auto w-full px-1.5 py-1">
//             <section className="relative items-center flex">
//               <Input
//                 className="h-6 w-22 pl-4 py-2 text-[10px] text-neutral-400  placeholder:text-neutral-400 border"
//                 placeholder=" BTC , 비트"
//                 value={(table.getColumn('market')?.getFilterValue() as string) ?? ''}
//                 onChange={event => table.getColumn('market')?.setFilterValue(event.target.value)}
//               />
//               <Search className="absolute size-[11px] left-1 top-[7px] text-neutral-500 pointer-events-none" />
//             </section>
//             <section className="flex gap-1">
//               <div className="flex justify-center items-center h-6 w-18 text-[10px]  gap-1 border-1 rounded-md">
//                 <span>Total</span> <span>{tableData?.length}</span>
//               </div>
//               <MarketDropdown
//                 exchangePlatform={exchangePlatform}
//                 setExchangePlatform={setExchangePlatform}
//                 setIsLoading={setIsLoading}
//                 setTickers={setTickers}
//               />
//               <MarketTypeDropDown
//                 exchangePlatform={exchangePlatform}
//                 exchangeMarketType={exchangeMarketType}
//                 setExchangeMarketType={setExchangeMarketType}
//               />
//             </section>
//           </div>
//         </nav>
//         <main
//           className={`flex-1 ${!wideSize ? 'h-[365px]' : 'h-[535px]'} overflow-y-scroll light-scrollbar dark-scrollbar`}>
//           <Table className="table table-fixed text-xs">
//             <TableHeader className="sticky top-0 z-0 h-7.5 text-[10px] font-extrabold bg-zinc-50 dark:bg-zinc-800">
//               {table.getHeaderGroups().map(headerGroup => (
//                 <TableRow key={headerGroup.id}>
//                   {headerGroup.headers.map(header => (
//                     <TableHead
//                       key={header.id}
//                       className="h-7.5 border-transparent text-stone-800 dark:text-gray-400 hover:cursor-pointer">
//                       {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
//                     </TableHead>
//                   ))}
//                 </TableRow>
//               ))}
//             </TableHeader>
//             <TableBody>
//               {isLoading ? (
//                 <TableRow>
//                   <TableCell
//                     colSpan={table.getAllColumns().filter(col => col.getIsVisible()).length || 1}
//                     className="h-48 text-center">
//                     <LoadingSpinner />
//                   </TableCell>
//                 </TableRow>
//               ) : (
//                 <>
//                   {table.getTopRows().map(row => (
//                     <TableRow
//                       className="border-transparent sticky bg-gray-100 dark:bg-gray-800 z-10"
//                       key={row.id}
//                       data-state={row.getIsSelected() && 'selected'}>
//                       {row
//                         .getVisibleCells()
//                         .map(cell =>
//                           cell.column.id === 'trade_price' ? (
//                             flexRender(cell.column.columnDef.cell, cell.getContext())
//                           ) : (
//                             <TableCell key={cell.id}>
//                               {flexRender(cell.column.columnDef.cell, cell.getContext())}
//                             </TableCell>
//                           ),
//                         )}
//                     </TableRow>
//                   ))}
//                   {table.getCenterRows().map(row => (
//                     <TableRow
//                       className="border-transparent"
//                       key={row.id}
//                       data-state={row.getIsSelected() && 'selected'}>
//                       {row
//                         .getVisibleCells()
//                         .map(cell =>
//                           cell.column.id === 'trade_price' ? (
//                             flexRender(cell.column.columnDef.cell, cell.getContext())
//                           ) : (
//                             <TableCell key={cell.id}>
//                               {flexRender(cell.column.columnDef.cell, cell.getContext())}
//                             </TableCell>
//                           ),
//                         )}
//                     </TableRow>
//                   ))}
//                 </>
//               )}
//             </TableBody>
//           </Table>
//         </main>
//       </div>
//     </ThemeProvider>
//   );
// };

// export default App;
