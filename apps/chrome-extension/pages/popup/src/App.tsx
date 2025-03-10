// import { useState, useEffect, useMemo } from 'react';
// import '@/styles/App.css';
// import { Ticker } from '@/types';
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
// import { getUpbitColumns } from '@/columns/upbitColumns';
// import { getBithumbColumns } from '@/columns/bithumbColumns';
// import { ThemeProvider } from '@/components/ThemeProvider';
// import { LoadingSpinner } from '@/components/ui/loadingSpinner';
// import { Input } from '@/components/ui/input';
// import { ModeToggle } from '@/components/ModeToggle';
// import { SizeToggle } from '@/components/SizeToggle';
// import { MarketDropdown } from '@/components/MarketDropdown';
// import { MarketTypeDropDown } from '@/components/MarketTypeDropDown';
// import { UpdateNoteToggle } from '@/components/UpdateNoteToggle';
// import { FavoriteToggle } from '@/components/FavoriteToggle';
// import { Search } from 'lucide-react';
// import comoLogo from '@/assets/icons/como-logo.png';

// // 타입 정의
// type ExchangePlatform = 'upbit' | 'bithumb';
// type MarketType = 'KRW' | 'BTC' | 'USDT';
// type FavoriteCoins = { upbit: string[]; bithumb: string[] };

// // 컴포넌트 외부에서 안정적인 fallback 데이터 정의
// const fallbackData: Ticker[] = [];

// // WebSocket 연결 커스텀 훅
// const usePort = (
//   setTickers: React.Dispatch<React.SetStateAction<{ [key: string]: Ticker }>>,
//   setExchangePlatform: React.Dispatch<React.SetStateAction<ExchangePlatform>>,
//   setExchangeRateUSD: React.Dispatch<React.SetStateAction<number>>,
//   setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
// ) => {
//   useEffect(() => {
//     const port = chrome.runtime.connect({ name: 'popup' });
//     let isInitialLoad = true;

//     port.onMessage.addListener(({ type, data }) => {
//       switch (type) {
//         case 'upbitWebsocketTicker':
//         case 'bithumbWebsocketTicker':
//           setTickers(prev => ({ ...prev, [data?.code]: { ...prev[data?.code], ...data } }));
//           break;
//         case 'upbitTickers':
//         case 'bithumbTickers':
//           console.log(`Received ${type}:`, data);
//           setTickers(data);
//           setIsLoading(false);
//           break;
//         case 'exchangeRateUSD':
//           if (isInitialLoad) {
//             setExchangeRateUSD(data);
//             isInitialLoad = false;
//           }
//           break;
//         case 'activeExchange':
//           setExchangePlatform(data);
//           break;
//       }
//     });

//     port.onDisconnect.addListener(() => {
//       setIsLoading(true);
//       console.warn('WebSocket disconnected, reconnecting...');
//       setTimeout(() => chrome.runtime.connect({ name: 'popup' }), 1000);
//     });

//     chrome.runtime.sendMessage({ action: 'getActiveExchange' });

//     return () => port.disconnect();
//   }, [setTickers, setExchangePlatform, setExchangeRateUSD, setIsLoading]);
// };

// // 즐겨찾기 관리 커스텀 훅
// const useFavorites = (exchangePlatform: ExchangePlatform) => {
//   const [favoriteCoins, setFavoriteCoins] = useState<FavoriteCoins>({ upbit: [], bithumb: [] });

//   useEffect(() => {
//     chrome.storage.local.get('como_extension', result => {
//       const stored = result?.como_extension?.favoriteCoins;
//       if (stored) setFavoriteCoins(stored);
//     });
//   }, []);

//   useEffect(() => {
//     chrome.storage.local.get('como_extension', result => {
//       const stored = result?.como_extension?.favoriteCoins || { upbit: [], bithumb: [] };
//       stored[exchangePlatform] = [...favoriteCoins[exchangePlatform]];
//       chrome.storage.local.set({ como_extension: { ...result.como_extension, favoriteCoins: stored } });
//     });
//   }, [favoriteCoins, exchangePlatform]);

//   return [favoriteCoins, setFavoriteCoins] as const;
// };

// const App = () => {
//   const [tickers, setTickers] = useState<{ [key: string]: Ticker }>({});
//   const [sorting, setSorting] = useState<SortingState>([]);
//   const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
//   const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
//   const [rowPinning, setRowPinning] = useState<RowPinningState>({ top: [], bottom: [] });
//   const [wideSize, setWideSize] = useState<boolean>(true);
//   const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
//   const [exchangeRateUSD, setExchangeRateUSD] = useState<number>(0);
//   const [exchangeMarketType, setExchangeMarketType] = useState<MarketType>('KRW');
//   const [exchangePlatform, setExchangePlatform] = useState<ExchangePlatform>('upbit');
//   const [isLoading, setIsLoading] = useState(true);
//   const [favoriteFunc, setFavoriteFunc] = useState(true);

//   const [favoriteCoins, setFavoriteCoins] = useFavorites(exchangePlatform);

//   usePort(setTickers, setExchangePlatform, setExchangeRateUSD, setIsLoading);

//   // 단일 테이블 데이터
//   const tableData = useMemo(() => {
//     if (!Object.values(tickers).length) return fallbackData;
//     return Object.values(tickers).filter(ticker => ticker.market?.startsWith(`${exchangeMarketType}-`));
//   }, [tickers, exchangeMarketType]);

//   // 컬럼 정의
//   const columns = useMemo<ColumnDef<Ticker>[]>(() => {
//     const columnArgs: [
//       boolean,
//       React.Dispatch<React.SetStateAction<boolean>>,
//       number,
//       MarketType,
//       FavoriteCoins,
//       React.Dispatch<React.SetStateAction<FavoriteCoins>>,
//       boolean,
//     ] = [coinNameKR, setCoinNameKR, exchangeRateUSD, exchangeMarketType, favoriteCoins, setFavoriteCoins, favoriteFunc];
//     return exchangePlatform === 'upbit' ? getUpbitColumns(...columnArgs) : getBithumbColumns(...columnArgs);
//   }, [coinNameKR, exchangeRateUSD, exchangeMarketType, favoriteCoins, exchangePlatform, favoriteFunc]);

//   // 단일 테이블 인스턴스
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
//     state: { sorting, columnFilters, columnVisibility, rowPinning },
//     initialState: { sorting: [{ id: 'trade_price', desc: true }] },
//     debugRows: true,
//   });

//   // 즐겨찾기와 동기화
//   useEffect(() => {
//     if (favoriteFunc && !isLoading) {
//       const rows = table.getRowModel().rows;
//       if (!rows.length) {
//         setRowPinning({ top: [], bottom: [] });
//         return;
//       }

//       const newPinnedRows = rows
//         .filter(row => favoriteCoins[exchangePlatform].includes(row.original.market))
//         .map(row => row.id);

//       setRowPinning(prev => {
//         const currentTop = prev.top ?? [];
//         if (newPinnedRows.length !== currentTop.length || !newPinnedRows.every(id => currentTop.includes(id))) {
//           console.log('Syncing pinned rows:', newPinnedRows);
//           return { top: newPinnedRows, bottom: [] };
//         }
//         return prev; // 변경 없으면 이전 상태 유지
//       });
//     }
//   }, [exchangeMarketType, exchangePlatform, favoriteCoins]);

//   // 컬럼 가시성 토글
//   useEffect(() => {
//     table.getAllColumns().forEach(column => column.toggleVisibility(wideSize));
//   }, [wideSize, table]);

//   return (
//     <ThemeProvider defaultTheme="dark" storageKey="como-ui-theme">
//       <div className={`flex-col ${wideSize ? 'w-[800px] h-[600px]' : 'w-[420px] h-[430px]'} overflow-hidden`}>
//         <nav className="flex-shrink-0">
//           <div className="flex justify-between items-center mx-auto w-full px-1.5 py-1">
//             <section>
//               <img src={comoLogo} className="size-6" />
//             </section>
//             <section className="flex gap-1">
//               <div className="relative flex justify-center items-center h-6 w-20 mr-2 text-[10px] gap-1 border-1 rounded-md hover:cursor-pointer group">
//                 <span>
//                   {exchangeRateUSD}
//                   <span className="text-neutral-400"> KRW</span>
//                 </span>
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
//                 className="h-6 w-22 pl-4 py-2 text-[10px] text-neutral-400 placeholder:text-neutral-400 border"
//                 placeholder=" BTC , 비트"
//                 value={(table.getColumn('market')?.getFilterValue() as string) ?? ''}
//                 onChange={event => table.getColumn('market')?.setFilterValue(event.target.value)}
//               />
//               <Search className="absolute size-[11px] left-1 top-[7px] text-neutral-500 pointer-events-none" />
//             </section>
//             <section className="flex gap-1">
//               <div className="flex justify-center items-center h-6 w-18 text-[10px] gap-1 border-1 rounded-md">
//                 <span>Total</span>
//                 <span>{table.getRowModel().rows.length}</span>
//               </div>
//               <MarketDropdown
//                 exchangePlatform={exchangePlatform}
//                 setExchangePlatform={setExchangePlatform}
//                 setIsLoading={setIsLoading}
//                 setTickers={setTickers}
//                 setRowPinning={setRowPinning}
//               />
//               <MarketTypeDropDown
//                 exchangePlatform={exchangePlatform}
//                 exchangeMarketType={exchangeMarketType}
//                 setExchangeMarketType={setExchangeMarketType}
//                 setRowPinning={setRowPinning}
//               />
//             </section>
//           </div>
//         </nav>
//         <main
//           className={`flex-1 ${wideSize ? 'h-[535px]' : 'h-[365px]'} overflow-y-scroll light-scrollbar dark-scrollbar`}>
//           <Table className="table table-fixed text-xs">
//             <TableHeader className="sticky top-0 z-49 h-7.5 text-[10px] font-extrabold bg-zinc-50 dark:bg-zinc-800">
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
//               {isLoading || !Object.keys(tickers).length ? (
//                 <TableRow>
//                   <TableCell
//                     colSpan={table.getAllColumns().filter(col => col.getIsVisible()).length || 1}
//                     className="h-48 text-center">
//                     <LoadingSpinner />
//                   </TableCell>
//                 </TableRow>
//               ) : (
//                 <>
//                   {table.getTopRows()?.map(row => (
//                     <TableRow
//                       className="border-transparent sticky bg-gray-100 dark:bg-gray-800 z-48"
//                       key={row.id}
//                       data-state={row.getIsSelected() && 'selected'}>
//                       {row.getVisibleCells().map(cell => (
//                         <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
//                       ))}
//                     </TableRow>
//                   ))}
//                   {table.getCenterRows()?.map(row => (
//                     <TableRow
//                       className="border-transparent"
//                       key={row.id}
//                       data-state={row.getIsSelected() && 'selected'}>
//                       {row.getVisibleCells().map(cell => (
//                         <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
//                       ))}
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

import { useState, useEffect, useMemo } from 'react';
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
import { Search } from 'lucide-react';
import comoLogo from '@/assets/icons/como-logo.png';

// 타입 정의
type ExchangePlatform = 'upbit' | 'bithumb';
type MarketType = 'KRW' | 'BTC' | 'USDT';
type FavoriteCoins = { upbit: string[]; bithumb: string[] };

const fallbackData: Ticker[] = [];

const usePort = (
  setTickers: React.Dispatch<React.SetStateAction<{ [key: string]: Ticker }>>,
  setExchangePlatform: React.Dispatch<React.SetStateAction<ExchangePlatform>>,
  setExchangeRateUSD: React.Dispatch<React.SetStateAction<number>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
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
        case 'upbitTickers':
        case 'bithumbTickers':
          console.log(`Received ${type}:`, data);
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
      }
    });

    port.onDisconnect.addListener(() => {
      setIsLoading(true);
      console.warn('WebSocket disconnected, reconnecting...');
      setTickers({});
      setTimeout(() => chrome.runtime.connect({ name: 'popup' }), 500);
    });

    chrome.runtime.sendMessage({ action: 'getActiveExchange' });

    return () => port.disconnect();
  }, [setTickers, setExchangePlatform, setExchangeRateUSD, setIsLoading]);
};

const useFavorites = () => {
  const [favoriteCoins, setFavoriteCoins] = useState<FavoriteCoins>({ upbit: [], bithumb: [] });

  useEffect(() => {
    chrome.storage.local.get('como_extension', result => {
      const stored = result?.como_extension?.favoriteCoins || { upbit: [], bithumb: [] };
      setFavoriteCoins(stored);
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.set({
      como_extension: { favoriteCoins },
    });
  }, [favoriteCoins]);

  return [favoriteCoins, setFavoriteCoins] as const;
};

const App = () => {
  const [tickers, setTickers] = useState<{ [key: string]: Ticker }>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowPinning, setRowPinning] = useState<RowPinningState>({ top: [], bottom: [] });
  const [wideSize, setWideSize] = useState<boolean>(true);
  const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
  const [exchangeRateUSD, setExchangeRateUSD] = useState<number>(0);
  const [exchangeMarketType, setExchangeMarketType] = useState<MarketType>('KRW');
  const [exchangePlatform, setExchangePlatform] = useState<ExchangePlatform>('upbit');
  const [isLoading, setIsLoading] = useState(true);
  const [favoriteFunc, setFavoriteFunc] = useState(true);

  const [favoriteCoins, setFavoriteCoins] = useFavorites();

  useEffect(() => {
    chrome.runtime.sendMessage('popupOpened');
    console.log('popup opened');
  }, []);

  usePort(setTickers, setExchangePlatform, setExchangeRateUSD, setIsLoading);

  const tableData = useMemo(() => {
    if (!Object.values(tickers).length) return fallbackData;
    return Object.values(tickers).filter(ticker => ticker.market?.startsWith(`${exchangeMarketType}-`));
  }, [tickers, exchangePlatform, exchangeMarketType]);

  const columns = useMemo<ColumnDef<Ticker>[]>(() => {
    const columnArgs: [
      boolean,
      React.Dispatch<React.SetStateAction<boolean>>,
      number,
      MarketType,
      FavoriteCoins,
      React.Dispatch<React.SetStateAction<FavoriteCoins>>,
      boolean,
    ] = [coinNameKR, setCoinNameKR, exchangeRateUSD, exchangeMarketType, favoriteCoins, setFavoriteCoins, favoriteFunc];
    return exchangePlatform === 'upbit' ? getUpbitColumns(...columnArgs) : getBithumbColumns(...columnArgs);
  }, [coinNameKR, exchangeRateUSD, exchangeMarketType, favoriteCoins, exchangePlatform, favoriteFunc]);

  const table = useReactTable({
    data: tableData,
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
  }, [wideSize, table]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="como-ui-theme">
      <div className={`flex-col ${wideSize ? 'w-[800px] h-[600px]' : 'w-[420px] h-[430px]'} overflow-hidden`}>
        <nav className="flex-shrink-0">
          <div className="flex justify-between items-center mx-auto w-full px-1.5 py-1">
            <section>
              <img src={comoLogo} className="size-6" />
            </section>
            <section className="flex gap-1">
              <div className="relative flex justify-center items-center h-6 w-20 mr-2 text-[10px] gap-1 border-1 rounded-md hover:cursor-pointer group">
                <span>
                  {exchangeRateUSD}
                  <span className="text-neutral-400"> KRW</span>
                </span>
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
                value={(table.getColumn('market')?.getFilterValue() as string) ?? ''}
                onChange={event => table.getColumn('market')?.setFilterValue(event.target.value)}
              />
              <Search className="absolute size-[11px] left-1 top-[7px] text-neutral-500 pointer-events-none" />
            </section>
            <section className="flex gap-1">
              <div className="flex justify-center items-center h-6 w-18 text-[10px] gap-1 border-1 rounded-md">
                <span>Total</span>
                <span>{table.getRowModel().rows.length}</span>
              </div>
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
            </section>
          </div>
        </nav>
        <main
          className={`flex-1 ${wideSize ? 'h-[535px]' : 'h-[365px]'} overflow-y-scroll light-scrollbar dark-scrollbar`}>
          <Table className="table table-fixed text-xs">
            <TableHeader className="sticky top-0 z-49 h-7.5 text-[10px] font-extrabold bg-zinc-50 dark:bg-zinc-800">
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
