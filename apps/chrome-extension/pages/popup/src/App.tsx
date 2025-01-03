import { useState, useEffect, useMemo, useRef } from 'react';
import '@/styles/App.css';
import { Ticker } from '@/types';
//table
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  VisibilityState,
  // RowPinningState,
  useReactTable,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
//market columns
import { getUpbitColumns } from '@/columns/upbitColumns';
import { getBithumbColumns } from '@/columns/bithumbColumns';
//components
import { ThemeProvider } from '@/components/ThemeProvider';
import { LoadingSpinner } from '@/components/ui/loadingSpinner';
import { Input } from '@/components/ui/input';
import { ModeToggle } from '@/components/ModeToggle';
import { SizeToggle } from '@/components/SizeToggle';
import { MarketDropdown } from '@/components/MarketDropdown';
// import FlashCell from '@/components/FlashCell';
import { MarketTypeDropDown } from '@/components/MarketTypeDropDown';
import { UpdateNoteToggle } from '@/components/UpdateNoteToggle';
import { FavoriteToggle } from '@/components/FavoriteToggle';
//icons
import { Search } from 'lucide-react';
import comoLogo from '@/assets/icons/como-logo.png';

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
//             console.log('exchangeRateUSD', data);
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

//   // useEffect(() => {
//   //   chrome.storage.local.get('como_extension', result => {
//   //     console.log('popup como_extension localstorage : ', result);
//   //     console.log('result', result);
//   //     const storageFavoriteCoins = result?.como_extension?.['favoriteCoins']?.[exchangePlatform];

//   //     if (storageFavoriteCoins) {
//   //       setFavoriteCoins(prev => {
//   //         const updatedCoins = { ...prev };
//   //         updatedCoins[exchangePlatform] = [...storageFavoriteCoins];
//   //         return updatedCoins;
//   //       });
//   //     }
//   //   });
//   // }, [exchangePlatform]);

//   // useEffect(() => {
//   //   // 즐겨찾기 데이터 저장
//   //   chrome.storage.local.get('como_extension', result => {
//   //     const comoStorage = result?.como_extension?.favoriteCoins || { upbit: [], bithumb: [] };
//   //     if (!comoStorage[exchangePlatform]) {
//   //       comoStorage[exchangePlatform] = [];
//   //     }

//   //     console.log('result popup : ', result);
//   //     console.log('comoStorage :', comoStorage);
//   //     console.log('comoStorage[exchangePlatform] : ', comoStorage[exchangePlatform]);

//   //     comoStorage[exchangePlatform] = [...favoriteCoins[exchangePlatform]];

//   //     console.log('comostorage popup:', comoStorage);
//   //     chrome.storage.local.set({
//   //       como_extension: {
//   //         ...result.como_extension,
//   //         favoriteCoins: comoStorage,
//   //       },
//   //     });
//   //   });
//   // }, [favoriteCoins]);

//   // 즐겨찾기 저장
//   useEffect(() => {
//     chrome.storage.local.get('como_extension', result => {
//       const currentData = result?.como_extension || {};
//       chrome.storage.local.set({
//         como_extension: {
//           ...currentData, // 기존 데이터 유지
//           favoriteCoins, // favoriteCoins만 업데이트
//         },
//       });
//     });
//   }, [favoriteCoins]);

//   // rowPinning 동기화
//   useEffect(() => {
//     if (!tableData.length) return;
//     const validMarkets = tableData.map(ticker => ticker.market?.trim());
//     const pinnedRows = favoriteCoins[exchangePlatform]
//       .map(market => market.trim())
//       .filter(market => validMarkets.includes(market));

//     console.log('tableData markets:', tableData.map(t => t.market));
//     console.log('rowPinning.top to be set:', pinnedRows);
//     console.log('rowPinning current:', rowPinning);

//     setRowPinning(prev => {
//       console.log('Setting rowPinning:', { ...prev, top: pinnedRows });
//       return { ...prev, top: pinnedRows };
//     });
//   }, [favoriteCoins, exchangePlatform, tableData]);

//   const columns: ColumnDef<Ticker>[] = useMemo(() => {
//     if (exchangePlatform === 'upbit') {
//       return getUpbitColumns(coinNameKR, setCoinNameKR, exchangeRateUSD, exchangeMarketType);
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
//     getRowId: row => row.market,
//     state: {
//       sorting,
//       columnFilters,
//       columnVisibility,
//       rowPinning,
//     },
//     initialState: {
//       sorting: [{ id: 'trade_price', desc: true }],
//     },
//     keepPinnedRows: true,
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
//                       className={`border-transparent sticky top-{${row.getPinnedIndex() * 26 + 48}px}`}
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

const App = () => {
  const [tickers, setTickers] = useState<{ [key: string]: Ticker }>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
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

  const rawTableData = useMemo(() => {
    if (!Object.values(tickers).length) return [];
    return Object.values(tickers).filter(ticker => ticker.market?.startsWith(`${exchangeMarketType}-`));
  }, [tickers, exchangeMarketType]);

  const tableData = useMemo(() => {
    const favoriteSet = new Set(favoriteCoins[exchangePlatform]);
    const pinnedRows = rawTableData.filter(ticker => favoriteSet.has(ticker.market));
    const unpinnedRows = rawTableData.filter(ticker => !favoriteSet.has(ticker.market));
    return [...pinnedRows, ...unpinnedRows];
  }, [rawTableData, favoriteCoins, exchangePlatform]);

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
          case 'bithumbWebsocketTicker':
            setTickers(prev => ({ ...prev, [data?.code]: { ...prev[data?.code], ...data } }));
            if (isLoading) setIsLoading(false);
            break;
          case 'upbitTickers':
          case 'bithumbTickers':
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
      const storageFavoriteCoins = result?.como_extension?.favoriteCoins || { upbit: [], bithumb: [] };
      setFavoriteCoins(storageFavoriteCoins);
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get('como_extension', result => {
      const currentData = result?.como_extension || {};
      chrome.storage.local.set({
        como_extension: {
          ...currentData,
          favoriteCoins,
        },
      });
    });
  }, [favoriteCoins]);

  const columns: ColumnDef<Ticker>[] = useMemo(() => {
    if (exchangePlatform === 'upbit') {
      return getUpbitColumns(coinNameKR, setCoinNameKR, exchangeRateUSD, exchangeMarketType);
    } else if (exchangePlatform === 'bithumb') {
      return getBithumbColumns(
        coinNameKR,
        setCoinNameKR,
        exchangeRateUSD,
        exchangeMarketType,
        favoriteCoins,
        setFavoriteCoins,
        exchangePlatform,
      );
    }
    return [];
  }, [coinNameKR, exchangeRateUSD, exchangeMarketType, exchangePlatform, favoriteCoins]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: row => row.market || `${Math.random()}`,
    state: { sorting, columnFilters, columnVisibility },
    initialState: { sorting: [{ id: 'trade_price', desc: true }] },
  });

  useEffect(() => {
    table.getAllColumns().forEach(column => column.toggleVisibility(wideSize));
  }, [wideSize, table]);

  const pinnedRowCount = useMemo(() => {
    return favoriteCoins[exchangePlatform].filter(market => rawTableData.some(ticker => ticker.market === market))
      .length;
  }, [favoriteCoins, exchangePlatform, rawTableData]);

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
                value={(table.getColumn('market')?.getFilterValue() as string) ?? ''}
                onChange={event => table.getColumn('market')?.setFilterValue(event.target.value)}
              />
              <Search className="absolute size-[11px] left-1 top-[7px] text-neutral-500 pointer-events-none" />
            </section>
            <section className="flex gap-1">
              <div className="flex justify-center items-center h-6 w-18 text-[10px] gap-1 border-1 rounded-md">
                <span>Total</span> <span>{tableData?.length}</span>
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
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={table.getAllColumns().filter(col => col.getIsVisible()).length || 1}
                    className="h-48 text-center">
                    <LoadingSpinner />
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={`border-transparent ${
                      index < pinnedRowCount ? 'sticky bg-gray-100 dark:bg-gray-800 z-10' : ''
                    }`}
                    style={{
                      top: index < pinnedRowCount ? `${index * 49 + 30}px` : undefined,
                    }}>
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
              )}
            </TableBody>
          </Table>
        </main>
      </div>
    </ThemeProvider>
  );
};

export default App;
