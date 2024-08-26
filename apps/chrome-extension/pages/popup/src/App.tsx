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
  RowPinningState,
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
//icons
import { Search } from 'lucide-react';
import comoLogo from '@/assets/icons/como-logo.png';

const App = () => {
  const [tickers, setTickers] = useState<{ [key: string]: Ticker }>({});
  //table states
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowPinning, setRowPinning] = useState<RowPinningState>({
    top: [],
    bottom: [],
  });

  const [wideSize, setWideSize] = useState<boolean>(true);
  const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
  const [exchangeRateUSD, setExchangeRateUSD] = useState<number>(0);
  const [exchangeMarketType, setExchangeMarketType] = useState<'KRW' | 'BTC' | 'USDT'>('KRW');
  const [exchangePlatform, setExchangePlatform] = useState<'upbit' | 'bithumb'>('upbit'); // 'coinone' | 'binance'
  const [isLoading, setIsLoading] = useState(true);
  // const [favoriteCoins, setFavoriteCoins] = useState<{ [key: string]: number }>({}); // market: timestamp

  const tableData = useMemo(() => {
    if (!Object.values(tickers).length) return [];
    const filteredData = Object.values(tickers).filter(ticker => ticker.market?.startsWith(`${exchangeMarketType}-`));
    return filteredData;
  }, [tickers, exchangeMarketType]);

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
            setTickers(prevTickers => ({
              ...prevTickers,
              [data?.code]: { ...prevTickers[data?.code], ...data },
            }));
            if (isLoading) {
              setIsLoading(false);
            }
            break;

          case 'bithumbWebsocketTicker':
            setTickers(prevTickers => ({ ...prevTickers, [data?.code]: { ...prevTickers[data?.code], ...data } }));
            if (isLoading) {
              setIsLoading(false);
            }
            break;

          case 'upbitTickers':
            setTickers(data);
            if (isLoading) {
              setIsLoading(false);
            }
            break;

          case 'bithumbTickers':
            setTickers(data);
            if (isLoading) {
              setIsLoading(false);
            }
            break;

          case 'exchangeRateUSD':
            console.log('exchangeRateUSD', data);
            setExchangeRateUSD(data);
            break;

          case 'activeExchange':
            setExchangePlatform(data);
            break;

          default:
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
    // 백그라운드 스트림 연결
    connectBackgroundStream();
    // 활성화 거래소
    chrome.runtime.sendMessage({ action: 'getActiveExchange' });
    // Chrome storage에 즐겨찾기 데이터 저장
    chrome.storage.local.get('como_extension', result => {
      const storageFavoriteCoins = result.como_extension['favoriteCoins'][exchangePlatform];
      console.log('popup como_extension localstorage : ', storageFavoriteCoins);
      // if (storageFavoriteCoins) {
      //   setFavoriteCoins(storageFavoriteCoins);
      // }
    });
  }, []);

  // useEffect(() => {
  //   chrome.storage.local.get('como_extension', result => {
  //     console.log('popup como_extension localstorage : ', result);
  //     const storageFavoriteCoins = result.como_extension['favoriteCoins'][exchangePlatform];
  //     if (storageFavoriteCoins) {
  //       setFavoriteCoins(storageFavoriteCoins);
  //     }
  //   });
  // }, [exchangePlatform]);

  // useEffect(() => {
  //   // 즐겨찾기 데이터 저장
  //   chrome.storage.local.get('como_extension', result => {
  //     const comoStorage = result.como_extension;
  //     comoStorage['favoriteCoins'][exchangePlatform] = favoriteCoins;
  //     chrome.storage.local.set({ ...comoStorage });
  //   });
  // }, [favoriteCoins]);

  const columns: ColumnDef<Ticker>[] = useMemo(() => {
    if (exchangePlatform === 'upbit') {
      return getUpbitColumns(coinNameKR, setCoinNameKR, exchangeRateUSD, exchangeMarketType);
    } else if (exchangePlatform === 'bithumb') {
      return getBithumbColumns(coinNameKR, setCoinNameKR, exchangeRateUSD, exchangeMarketType);
    }
    return [];
  }, [coinNameKR, exchangeRateUSD, exchangeMarketType, exchangePlatform]);

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
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowPinning,
    },
    initialState: {
      sorting: [{ id: 'trade_price', desc: true }],
    },
    keepPinnedRows: true,
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
              <div className="relative flex justify-center items-center h-6 w-16 mr-2 text-[10px]  gap-1 border-1 rounded-md hover:cursor-pointer group">
                <span>{isLoading ? '-' : exchangeRateUSD}원</span>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[9999]">
                  {'한국수출입은행 고시 환율'}
                </span>
              </div>
              <UpdateNoteToggle />
              <ModeToggle />
              <SizeToggle wideSize={wideSize} setWideSize={setWideSize} />
            </section>
          </div>
          <div className="flex justify-between mx-auto w-full px-1.5 py-1">
            <section className="relative items-center flex">
              <Input
                className="h-6 w-22 pl-4 py-2 text-[10px] text-neutral-400  placeholder:text-neutral-400 border"
                placeholder=" BTC , 비트"
                value={(table.getColumn('market')?.getFilterValue() as string) ?? ''}
                onChange={event => table.getColumn('market')?.setFilterValue(event.target.value)}
              />
              <Search className="absolute size-[11px] left-1 top-[7px] text-neutral-500 pointer-events-none" />
            </section>
            <section className="flex gap-1">
              <div className="flex justify-center items-center h-6 w-18 text-[10px]  gap-1 border-1 rounded-md">
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
                <>
                  {table.getTopRows().map(row => (
                    <TableRow
                      className="border-transparent"
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}>
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
                  ))}
                  {table.getCenterRows().map(row => (
                    <TableRow
                      className="border-transparent"
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}>
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

//=============================================================================================================

// import { useState, useEffect, useMemo, useRef } from 'react';
// import '@/styles/App.css';
// import { Ticker } from '@/types';
// import {
//   useReactTable,
//   getCoreRowModel,
//   ColumnDef,
//   SortingState,
//   flexRender,
//   ColumnFiltersState,
//   getFilteredRowModel,
//   VisibilityState,
//   Row,
//   Column,
//   Header,
//   HeaderGroup,
//   Cell,
//   Table as ReactTable,
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
// import { Search, Star } from 'lucide-react';
// import comoLogo from '@/assets/icons/como-logo.png';

// const App = () => {
//   const [sorting, setSorting] = useState<SortingState>([]);
//   const [tickers, setTickers] = useState<{ [key: string]: Ticker }>({});
//   const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
//   const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
//   const [wideSize, setWideSize] = useState<boolean>(true);
//   const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
//   const [exchangeRateUSD, setExchangeRateUSD] = useState<number>(0);
//   const [exchangeMarketType, setExchangeMarketType] = useState<'KRW' | 'BTC' | 'USDT'>('KRW');
//   const [exchangePlatform, setExchangePlatform] = useState<'upbit' | 'bithumb'>('upbit');
//   const [isLoading, setIsLoading] = useState(true);
//   const [favoriteCoins, setFavoriteCoins] = useState<{ [key: string]: number }>({}); // market: timestamp

//   const portRef = useRef<chrome.runtime.Port | null>(null);

//   const toggleFavorite = (market: string) => {
//     setFavoriteCoins(prev => {
//       const newFavorites = { ...prev };
//       if (newFavorites[market]) {
//         delete newFavorites[market];
//       } else {
//         newFavorites[market] = Date.now();
//       }
//       return newFavorites;
//     });
//   };

//   // 커스텀 정렬 함수
//   const customSortRows = (rows: Row<Ticker>[], sorting: SortingState): Row<Ticker>[] => {
//     const favoriteRows = rows.filter(row => favoriteCoins[row.original.market!]);
//     const otherRows = rows.filter(row => !favoriteCoins[row.original.market!]);

//     const sortRows = (rowsToSort: Row<Ticker>[]): Row<Ticker>[] => {
//       if (sorting.length > 0) {
//         const [{ id, desc }] = sorting;
//         rowsToSort.sort((a, b) => {
//           const aValue = a.getValue(id);
//           const bValue = b.getValue(id);
//           if (typeof aValue === 'number' && typeof bValue === 'number') {
//             return desc ? bValue - aValue : aValue - bValue;
//           }
//           return desc ? String(bValue).localeCompare(String(aValue)) : String(aValue).localeCompare(String(bValue));
//         });
//       }
//       return rowsToSort;
//     };

//     const sortedFavoriteRows = sortRows(favoriteRows);
//     const sortedOtherRows = sortRows(otherRows);

//     return [...sortedFavoriteRows, ...sortedOtherRows];
//   };

//   const tableData = useMemo(() => {
//     if (!Object.values(tickers).length) return [] as Ticker[];
//     return Object.values(tickers).filter(ticker => ticker.market?.startsWith(`${exchangeMarketType}-`));
//   }, [tickers, exchangeMarketType]);

//   const connectBackgroundStream = () => {
//     if (portRef.current) return;
//     const port = chrome.runtime.connect({ name: 'popup' });
//     portRef.current = port;
//     try {
//       port.onMessage.addListener(message => {
//         const { type, data } = message;
//         switch (type) {
//           case 'upbitWebsocketTicker':
//           case 'bithumbWebsocketTicker':
//             setTickers(prev => ({ ...prev, [data?.code]: { ...prev[data?.code], ...data } }));
//             if (isLoading) setIsLoading(false);
//             break;
//           case 'upbitTickers':
//           case 'bithumbTickers':
//             setTickers(data);
//             if (isLoading) setIsLoading(false);
//             break;
//           case 'exchangeRateUSD':
//             setExchangeRateUSD(data);
//             break;
//           case 'activeExchange':
//             setExchangePlatform(data);
//             break;
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
//     connectBackgroundStream();
//     chrome.runtime.sendMessage({ action: 'getActiveExchange' });
//     chrome.storage.local.get('como_extension', result => {
//       const storageFavoriteCoins = result.como_extension?.['favoriteCoins']?.[exchangePlatform] || {};
//       setFavoriteCoins(storageFavoriteCoins);
//     });
//   }, []);

//   useEffect(() => {
//     chrome.storage.local.get('como_extension', result => {
//       const storageFavoriteCoins = result.como_extension?.['favoriteCoins']?.[exchangePlatform] || {};
//       setFavoriteCoins(storageFavoriteCoins);
//     });
//   }, [exchangePlatform]);

//   useEffect(() => {
//     chrome.storage.local.get('como_extension', result => {
//       let comoStorage = result.como_extension || { favoriteCoins: {} };
//       comoStorage.favoriteCoins[exchangePlatform] = favoriteCoins;
//       chrome.storage.local.set({ como_extension: comoStorage });
//     });
//   }, [favoriteCoins]);

//   const columns: ColumnDef<Ticker>[] = useMemo(() => {
//     const baseColumns =
//       exchangePlatform === 'upbit'
//         ? getUpbitColumns(coinNameKR, setCoinNameKR, exchangeRateUSD, exchangeMarketType)
//         : getBithumbColumns(coinNameKR, setCoinNameKR, exchangeRateUSD, exchangeMarketType);

//     return [
//       {
//         id: 'favorite',
//         header: '',
//         cell: ({ row }) => (
//           <button onClick={() => toggleFavorite(row.original.market!)}>
//             <Star
//               className={`size-4 ${favoriteCoins[row.original.market!] ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`}
//             />
//           </button>
//         ),
//         size: 30,
//       },
//       ...baseColumns,
//     ];
//   }, [coinNameKR, exchangeRateUSD, exchangeMarketType, exchangePlatform, favoriteCoins]);

//   const table: ReactTable<Ticker> = useReactTable({
//     data: tableData,
//     columns,
//     getCoreRowModel: getCoreRowModel(),
//     onSortingChange: setSorting,
//     onColumnFiltersChange: setColumnFilters,
//     getFilteredRowModel: getFilteredRowModel(),
//     onColumnVisibilityChange: setColumnVisibility,
//     state: { sorting, columnFilters, columnVisibility },
//     initialState: { sorting: [{ id: 'trade_price', desc: true }] },
//     getSortedRowModel: tableInstance => () => {
//       const coreRows = tableInstance.getCoreRowModel().rows; // 정렬 전 원본 행 사용
//       const sortedRows = customSortRows(coreRows, sorting);
//       return {
//         rows: sortedRows,
//         flatRows: sortedRows,
//         rowsById: sortedRows.reduce(
//           (acc, row) => {
//             acc[row.id] = row;
//             return acc;
//           },
//           {} as Record<string, Row<Ticker>>,
//         ),
//       };
//     },
//   });

//   useEffect(() => {
//     table.getAllColumns().forEach((column: Column<Ticker>) => column.toggleVisibility(wideSize));
//   }, [wideSize, table]);

//   return (
//     <ThemeProvider defaultTheme="dark" storageKey="como-ui-theme">
//       <div className={`flex-col ${!wideSize ? 'w-[420px] h-[430px]' : 'w-[800px] h-[600px]'} overflow-hidden`}>
//         <nav className="flex-shrink-0">
//           <div className="flex justify-between items-center mx-auto w-full px-1.5 py-1">
//             <section>
//               <img src={comoLogo} className="size-6" />
//             </section>
//             <section className="flex gap-1">
//               <div className="relative flex justify-center items-center h-6 w-16 mr-2 text-[10px] gap-1 border-1 rounded-md hover:cursor-pointer group">
//                 <span>{isLoading ? '-' : exchangeRateUSD}원</span>
//                 <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-[9999]">
//                   {'한국수출입은행 고시 환율'}
//                 </span>
//               </div>
//               <UpdateNoteToggle />
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
//               {table.getHeaderGroups().map((headerGroup: HeaderGroup<Ticker>) => (
//                 <TableRow key={headerGroup.id}>
//                   {headerGroup.headers.map((header: Header<Ticker, unknown>) => (
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
//                     colSpan={table.getAllColumns().filter((col: Column<Ticker>) => col.getIsVisible()).length || 1}
//                     className="h-48 text-center">
//                     <LoadingSpinner />
//                   </TableCell>
//                 </TableRow>
//               ) : (
//                 table.getRowModel().rows.map((row: Row<Ticker>) => (
//                   <TableRow className="border-transparent" key={row.id} data-state={row.getIsSelected() && 'selected'}>
//                     {row.getVisibleCells().map((cell: Cell<Ticker, unknown>) => (
//                       <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
//                     ))}
//                   </TableRow>
//                 ))
//               )}
//             </TableBody>
//           </Table>
//         </main>
//       </div>
//     </ThemeProvider>
//   );
// };

// export default App;
