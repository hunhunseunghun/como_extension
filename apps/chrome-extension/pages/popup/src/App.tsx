import { useState, useEffect, useMemo, useRef, useCallback, memo, lazy, Suspense } from 'react';
import '@/styles/App.css';
import {
  UpbitTicker,
  BithumbTicker,
  BinanceTicker,
  ExchangePlatform,
  MarketType,
  maxChagneRateCoin,
  KimchiPremium,
  AthMap,
  CoinMarket,
} from '@/types';
import { useFavorites } from '@/hooks/useFavorites';
import { useWideSize } from '@/hooks/useWideSize';
import { usePort } from '@/hooks/usePort';
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
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getKrwColumns } from '@/columns/krwColumns';
import { getGlobalColumns } from '@/columns/globalColumns';
import { EXCHANGES, isGlobalExchange, isKrwExchange, MARKET_TYPES } from '@/constants/exchanges';
import { ExchangePermissionGate } from '@/components/ExchangePermissionGate';
import { useExchangePermission } from '@/lib/exchangePermission';
import { KIMCHI_COLUMN_KEY, QUIET_MODE_KEY, useStoredFlag } from '@/hooks/useStoredFlag';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Input } from '@/components/ui/input';
import { SizeToggle } from '@/components/SizeToggle';
import { MarketDropdown } from '@/components/MarketDropdown';
import { MarketTypeDropDown } from '@/components/MarketTypeDropDown';
import { UpdateNoteToggle } from '@/components/UpdateNoteToggle';
import { WhatsNew } from '@/components/WhatsNew';
import { PriceNotiPopover as PriceNotiPopoverBase } from '@/components/PriceNotiPopover';
import { KimchiPremiumBadge } from '@/components/KimchiPremiumBadge';
import { SettingsPopover as SettingsPopoverBase } from '@/components/SettingsPopover';
import { isSidePanelView } from '@/lib/settings';
import { PortfolioPopover as PortfolioPopoverBase } from '@/components/PortfolioPopover';
import { InsightsPopover as InsightsPopoverBase } from '@/components/InsightsPopover';
import { DexWatchlistPopover as DexWatchlistPopoverBase } from '@/components/DexWatchlistPopover';
import { ReviewPrompt } from '@/components/ReviewPrompt';
import { useI18n } from '@/i18n';
import { FiatRates, MarketContext, MarketStats } from '@/lib/market';
import { Search, Loader2 } from 'lucide-react';
import { ChartProvider } from './components/ChartToolTip';

import fireLogo from '@/assets/icons/fire.svg';
import comoLogo from '@/assets/icons/como-logo.png';
import { HoverHint } from '@/components/ui/hoverHint';
import { WalletStatusContext, type WalletStatus } from '@/lib/walletStatusContext';

// 첫 실행 안내는 새로 설치한 사용자에게만 뜨므로 필요할 때 불러온다.
const Onboarding = lazy(() => import('@/components/Onboarding').then(m => ({ default: m.Onboarding })));

// 툴바 팝오버는 시세와 상관없으므로 시세가 바뀔 때마다 App과 함께 다시 그리지 않는다.
const InsightsPopover = memo(InsightsPopoverBase);
const DexWatchlistPopover = memo(DexWatchlistPopoverBase);
const PortfolioPopover = memo(PortfolioPopoverBase);
const PriceNotiPopover = memo(PriceNotiPopoverBase);
const SettingsPopover = memo(SettingsPopoverBase);

type TickerTypes = UpbitTicker | BithumbTicker | BinanceTicker;
const fallbackData: TickerTypes[] = [];
// 행 id는 마켓 코드로 둔다. 기본값(배열 순번)이면 시세가 바뀔 때 고정 행이 다른 종목을 가리킨다.
// 바이낸스 스냅샷에도 market 필드가 있어 symbol을 먼저 본다.
const getRowId = (row: TickerTypes) => ('symbol' in row && row.symbol ? row.symbol : (row as UpbitTicker).market);

const App = () => {
  const { language, t, currency } = useI18n();
  const [tickers, setTickers] = useState<{ [key: string]: TickerTypes }>({});
  // 처음에는 현재가 높은 순. initialState에 두면 state.sorting([])에 덮여 적용되지 않는다.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'trade_price', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [storedWideSize, setWideSize] = useWideSize();
  // 사이드 패널은 폭이 정해져 있지 않아 창 크기에 맞춰 그리고, 넓으면 와이드 컬럼을 쓴다.
  const isSidePanel = useMemo(isSidePanelView, []);
  const [panelSize, setPanelSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    if (!isSidePanel) return;
    const handleResize = () => setPanelSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidePanel]);
  const wideSize = isSidePanel ? panelSize.width >= 700 : storedWideSize;
  const [coinNameKR, setCoinNameKR] = useState<boolean>(true);
  const [exchangeRateUSD, setExchangeRateUSD] = useState<number>(0);
  const [exchangeMarketType, setExchangeMarketType] = useState<MarketType>('KRW');
  const [exchangePlatform, setExchangePlatform] = useState<ExchangePlatform>('upbit');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [favoriteFunc, setFavoriteFunc] = useState<boolean>(true);
  const [updatedVersion, setUpdatedVersion] = useState<string>('');
  const [favoriteCoins, setFavoriteCoins] = useFavorites();
  const [maxChangeRateCoin, setMaxChangeRateCoin] = useState<maxChagneRateCoin>({
    exchange: '',
    market: '',
    changeRate: 0,
  });
  const [timeFrame, setTimeFrame] = useState<string>('1d');
  const [kimchiPremium, setKimchiPremium] = useState<KimchiPremium>({ rate: null, items: {} });
  // 표의 김프 열은 2초마다 바뀌는 김프를 ref로 읽어, 바뀔 때마다 컬럼을 새로 만들지 않는다.
  const kimchiRef = useRef(kimchiPremium);
  kimchiRef.current = kimchiPremium;
  const [kimchiInNarrow] = useStoredFlag(KIMCHI_COLUMN_KEY);
  const [quietMode] = useStoredFlag(QUIET_MODE_KEY);
  // 조용한 모드: 상승·하락 색과 깜빡임을 끄고 회색으로만 보여 준다(스타일은 index.css의 [data-quiet]).
  useEffect(() => {
    if (quietMode) document.documentElement.dataset.quiet = '';
    else delete document.documentElement.dataset.quiet;
  }, [quietMode]);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>({});
  const [fiatRates, setFiatRates] = useState<FiatRates>({});
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  // ATH 대비 하락률과 알트코인 시즌 지수(1시간마다). ATH 열은 컬럼을 다시 만들지 않도록 ref로 읽는다.
  const [coinMarket, setCoinMarket] = useState<CoinMarket | null>(null);
  const athRef = useRef<AthMap>({});
  athRef.current = coinMarket?.ath ?? {};
  const marketContext = useMemo(
    () => ({ exchangeRateUSD, fiatRates, marketStats, coinMarket }),
    [exchangeRateUSD, fiatRates, marketStats, coinMarket],
  );

  const handleExtraMessage = useCallback((type: string, data: unknown) => {
    if (type === 'fiatRates') setFiatRates(data as FiatRates);
    if (type === 'marketStats') setMarketStats(data as MarketStats);
    if (type === 'coinMarket') setCoinMarket(data as CoinMarket);
    if (type === 'walletStatus') setWalletStatus(data as WalletStatus);
  }, []);

  const updatedVersionHandler = useCallback((newVersion: string) => {
    chrome.storage.local.get('updatedVersion', result => {
      const stored = result?.updatedVersion || '';
      if (stored !== newVersion) {
        setUpdatedVersion(newVersion);
      }
    });
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage('popupOpened');
  }, []);

  // 한국어가 아니면 코인 이름을 영문명으로 보여준다.
  useEffect(() => {
    setCoinNameKR(language === 'ko');
  }, [language]);

  // 화면의 거래소를 바꾼다. 백그라운드가 알려준 거래소(처음 연결, 다른 창에서 변경)도 이 경로를 탄다.
  // 이전 거래소의 시세와 고정 행은 비운다. 고정 행이 남아 있으면 새 표에서 그 행을 찾지 못해 화면이 멈춘다.
  const exchangeRef = useRef(exchangePlatform);
  const changeExchange = useCallback((exchange: ExchangePlatform) => {
    if (exchange === exchangeRef.current) return;
    exchangeRef.current = exchange;
    setTickers({});
    setIsLoading(true);
    setExchangePlatform(exchange);
  }, []);

  // 사용자가 고른 거래소만 백그라운드에 알린다. 첫 렌더의 기본값(upbit)을 보내면 저장된 거래소를 덮어쓴다.
  const selectExchange = useCallback(
    (exchange: ExchangePlatform) => {
      changeExchange(exchange);
      chrome.runtime.sendMessage({ action: 'changeExchange', exchange });
    },
    [changeExchange],
  );

  usePort(
    setTickers,
    changeExchange,
    setExchangeRateUSD,
    setIsLoading,
    updatedVersionHandler,
    setMaxChangeRateCoin,
    setKimchiPremium,
    handleExtraMessage,
  );

  const tableData = useMemo<TickerTypes[]>(() => {
    if (!Object.values(tickers).length) return fallbackData;

    if (isKrwExchange(exchangePlatform)) {
      return Object.values(tickers).filter(
        (ticker): ticker is UpbitTicker | BithumbTicker =>
          'market' in ticker && ticker.market?.startsWith(`${exchangeMarketType}-`),
      );
    }
    return Object.values(tickers).filter(
      (ticker): ticker is BinanceTicker => 'symbol' in ticker && ticker.symbol?.endsWith(`${exchangeMarketType}`),
    );
  }, [tickers, exchangePlatform, exchangeMarketType]);

  // 즐겨찾기는 사용자가 정한 순서대로 위에 고정한다. 표에 없는 종목(다른 마켓)은 빼야 한다.
  // 없는 행을 고정 목록에 두면 표가 그 행을 찾다가 오류로 멈춘다.
  const rowPinning = useMemo<RowPinningState>(() => {
    if (isLoading || !favoriteFunc) return { top: [], bottom: [] };
    const ids = new Set(tableData.map(getRowId));
    return { top: (favoriteCoins[exchangePlatform] ?? []).filter(id => ids.has(id)), bottom: [] };
  }, [isLoading, favoriteFunc, tableData, favoriteCoins, exchangePlatform]);

  // 즐겨찾기 순서 바꾸기(끌어 놓기, Alt+↑↓)
  const moveFavorite = useCallback(
    (from: string, to: string) => {
      setFavoriteCoins(prev => {
        const list = [...(prev[exchangePlatform] ?? [])];
        const fromIndex = list.indexOf(from);
        const toIndex = list.indexOf(to);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
        list.splice(fromIndex, 1);
        list.splice(toIndex, 0, from);
        return { ...prev, [exchangePlatform]: list };
      });
    },
    [exchangePlatform, setFavoriteCoins],
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const hasExchangePermission = useExchangePermission(exchangePlatform);

  const specificMarketType = useMemo(() => {
    if (isGlobalExchange(exchangePlatform)) {
      const available = MARKET_TYPES[exchangePlatform];
      // 거래소를 막 바꿨을 때 이전 거래소의 마켓이 남아 있으면 새 거래소 기본값을 쓴다.
      return available.includes(exchangeMarketType) ? exchangeMarketType : available[0];
    }
    return exchangeMarketType;
  }, [exchangePlatform, exchangeMarketType]);

  const columns = useMemo<ColumnDef<TickerTypes>[]>(() => {
    if (isKrwExchange(exchangePlatform)) {
      return getKrwColumns({
        exchange: exchangePlatform,
        coinNameKR,
        setCoinNameKR,
        exchangeRateUSD,
        exchangeMarketType,
        favoriteCoins,
        setFavoriteCoins,
        favoriteFunc,
        wideSize,
        timeframe: timeFrame,
        setTimeframe: setTimeFrame,
        t,
        displayCurrency: currency,
        fiatRates,
        kimchiRef,
        athRef,
      }) as ColumnDef<TickerTypes>[];
    }
    return getGlobalColumns(
      exchangePlatform,
      specificMarketType,
      favoriteCoins,
      setFavoriteCoins,
      favoriteFunc,
      setSorting,
      wideSize,
      timeFrame,
      setTimeFrame,
      t,
      currency,
      exchangeRateUSD,
      fiatRates,
      athRef,
    ) as ColumnDef<TickerTypes>[];
  }, [
    coinNameKR,
    exchangeRateUSD,
    exchangeMarketType,
    favoriteCoins,
    exchangePlatform,
    favoriteFunc,
    wideSize,
    timeFrame,
    t,
    currency,
    fiatRates,
  ]);

  // 좁은 화면은 칸이 모자라 52주 열을 숨긴다. 김프 열은 설정에 따라 거래대금 자리에 보여 준다.
  const columnVisibility = useMemo<VisibilityState>(
    () => ({
      highest_52_week_diff: wideSize,
      lowest_52_week_diff: wideSize,
      highest_24h_diff: wideSize,
      lowest_24h_diff: wideSize,
      kimchi_premium: wideSize || kimchiInNarrow,
      ath_diff: wideSize,
      acc_trade_price_24h: wideSize || !isKrwExchange(exchangePlatform) || !kimchiInNarrow,
    }),
    [wideSize, kimchiInNarrow, exchangePlatform],
  );

  const table = useReactTable<TickerTypes>({
    data: tableData,
    columns: columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters, columnVisibility, rowPinning },
    enableRowPinning: favoriteFunc,
    keepPinnedRows: true,
  });

  const centerRows = table.getCenterRows();
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: centerRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // 행 높이 고정
    overscan: 10,
    getItemKey: index => centerRows[index]?.id, // 행의 고유 키 설정
  });

  // 열 너비 계산
  const viewportWidth = isSidePanel ? panelSize.width : wideSize ? 800 : 420; // 뷰포트 너비
  const chartColumnWidth = wideSize ? 62 : 48; // 차트 열 고정 너비
  const remainingWidth = viewportWidth - chartColumnWidth; // 나머지 열이 사용할 너비
  const nonChartColumns = table.getAllColumns().filter(col => col.id !== 'candlestick_chart');
  // 와이드·넓은 화면에서는 종목명 열을 조금 더 넓게 준다. 좁은 팝업에서 넓히면 가격 칸(예: ₩113,963,380)이 두 줄로 꺾인다.
  const columnWeight = (columnId: string) => (columnId === 'market' && viewportWidth >= 600 ? 1.2 : 1);
  const totalWeight = nonChartColumns.reduce((sum, col) => sum + columnWeight(col.id), 0);

  const getColumnWidth = (columnId: string) =>
    columnId === 'candlestick_chart'
      ? chartColumnWidth
      : Math.floor((remainingWidth * columnWeight(columnId)) / totalWeight) || 100;

  const maxChangeRateCoinhandleLogo = (exchange: string) => EXCHANGES[exchange as ExchangePlatform]?.logo;

  return (
    <MarketContext.Provider value={marketContext}>
      {/* 입출금 상태는 시세 표와 인사이트(김프 차익 계산기)가 함께 쓴다. */}
      <WalletStatusContext.Provider value={walletStatus}>
      <ChartProvider>
        <ThemeProvider defaultTheme="system" storageKey="como-ui-theme">
          <div
            className={`flex-col ${isSidePanel ? 'w-screen h-screen' : wideSize ? 'w-[800px] h-[600px]' : 'w-[420px] h-[430px]'} overflow-hidden`}>
            <nav className="flex-shrink-0 p-1">
              <div className="flex justify-between items-end mx-auto w-full">
                <section>
                  <img src={comoLogo} className="size-4 m-1 ml-0" />
                </section>
                <section>
                  {maxChangeRateCoin.market && !wideSize && (
                    <div className="relative flex justify-center items-end h-6 text-cap-s font-semibold gap-1 border-transparent border-1 rounded-md group hover:cursor-default">
                      <img src={fireLogo} className="h-4 w-4" />
                      <div className="flex items-center gap-0.5">
                        <span>{maxChangeRateCoin.market}</span>
                        <img className="h-2.5 w-2.5" src={maxChangeRateCoinhandleLogo(maxChangeRateCoin.exchange)} />
                      </div>
                      <span className={maxChangeRateCoin.changeRate > 0 ? 'text-up' : 'text-down'}>
                        {maxChangeRateCoin.changeRate > 0 ? '+' : ''}
                        {maxChangeRateCoin.market && maxChangeRateCoin.changeRate?.toFixed(2)}%
                      </span>

                      <HoverHint>
                        {t('topGainer')}
                      </HoverHint>
                    </div>
                  )}
                </section>
                <section className="flex gap-1">
                  <UpdateNoteToggle updatedVersion={updatedVersion} />
                  <InsightsPopover />
                <DexWatchlistPopover />
                <PortfolioPopover />
                  <PriceNotiPopover />
                    <SettingsPopover favoriteFunc={favoriteFunc} setFavoriteFunc={setFavoriteFunc} />
                    {!isSidePanel && <SizeToggle wideSize={wideSize} setWideSize={setWideSize} />}
                </section>
              </div>
              <div className="flex justify-between mx-auto w-full px-1 py-1">
                <section className="flex gap-1">
                  <MarketDropdown exchangePlatform={exchangePlatform} setExchangePlatform={selectExchange} />
                  <MarketTypeDropDown
                    exchangePlatform={exchangePlatform}
                    exchangeMarketType={exchangeMarketType}
                    setExchangeMarketType={setExchangeMarketType}
                  />
                  <div className="relative flex justify-center items-center h-6 w-15 text-cap-s gap-1 border-transparent border-1 rounded-md group hover:cursor-default">
                    <span>Total</span>
                    <span className="w-[17px]">{table.getRowModel().rows.length}</span>
                    <HoverHint>
                      {t('marketCount')}
                    </HoverHint>
                  </div>
                  {/* 400px보다 좁은 사이드 패널에서는 검색창 자리를 위해 환율을 숨긴다. */}
                  <div className="relative flex justify-center items-center h-6 min-w-16 whitespace-nowrap text-cap-s gap-1 border-transparent border-1 rounded-md group hover:cursor-default max-[400px]:hidden">
                    <span className="num">
                      {exchangeRateUSD}
                      <span className="text-fg-faint"> KRW</span>
                    </span>
                    <HoverHint>
                      {t('exchangeRateSource')}
                    </HoverHint>
                  </div>
                  {maxChangeRateCoin.market && wideSize && (
                    <div className="relative flex justify-center items-center h-6 ml-[2px] text-cap-s font-semibold gap-0.5 border-transparent border-1 rounded-md group hover:cursor-default">
                      <img src={fireLogo} className="h-4 w-4" />
                      <div className="flex items-center gap-0.5">
                        <span>{maxChangeRateCoin.market}</span>
                        <img className="h-2.5 w-2.5" src={maxChangeRateCoinhandleLogo(maxChangeRateCoin.exchange)} />
                      </div>
                      <span className={maxChangeRateCoin.changeRate > 0 ? 'text-up' : 'text-down'}>
                        {maxChangeRateCoin.changeRate > 0 ? '+' : ''}
                        {maxChangeRateCoin.market && maxChangeRateCoin.changeRate?.toFixed(2)}%
                      </span>

                      <HoverHint className="font-normal">
                        {t('topGainer')}
                      </HoverHint>
                    </div>
                  )}
                  {wideSize && !isGlobalExchange(exchangePlatform) && (
                    <KimchiPremiumBadge kimchiPremium={kimchiPremium} exchangePlatform={exchangePlatform} />
                  )}
                </section>
                <section className="relative items-center flex">
                  <Input
                    className="h-6 w-30 pl-4 py-2 text-cap-s"
                    aria-label={t('searchLabel')}
                    placeholder={` ${t('searchPlaceholder')}`}
                    value={(table.getColumn('market')?.getFilterValue() as string) ?? ''}
                    onChange={event => table.getColumn('market')?.setFilterValue(event.target.value)}
                  />
                  <Search className="absolute size-[11px] left-1 top-[7px] text-fg-subtle pointer-events-none" />
                </section>
              </div>
            </nav>
            <main
              className={`relative ${isSidePanel ? '' : wideSize ? 'h-[535px]' : 'h-[365px]'}`}
              style={isSidePanel ? { height: panelSize.height - 65 } : undefined}>
              {/* TableHeader */}
              <div ref={headerRef} className="sticky top-0 z-50 bg-neutral-weak overflow-x-hidden">
                <Table className="table-fixed text-body-s w-full">
                  <TableHeader className="h-7.5 text-cap-s font-heavy">
                    {table.getHeaderGroups().map(headerGroup => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map(header => {
                          const adjustedWidth = getColumnWidth(header.id);
                          return (
                            <TableHead
                              key={header.id}
                              aria-sort={
                                header.column.getIsSorted() === 'asc'
                                  ? 'ascending'
                                  : header.column.getIsSorted() === 'desc'
                                    ? 'descending'
                                    : undefined
                              }
                              style={{
                                width: adjustedWidth,
                                minWidth: adjustedWidth,
                                maxWidth: adjustedWidth,
                              }}
                              className="h-7.5 border-transparent text-fg-muted hover:cursor-pointer">
                              {header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                </Table>
              </div>
              {/* TableBody with Virtualized Scrolling */}
              <div
                ref={parentRef}
                className={`overflow-y-scroll overflow-x-hidden light-scrollbar dark-scrollbar ${isSidePanel ? '' : wideSize ? 'h-[500px]' : 'h-[330px]'}`}
                style={isSidePanel ? { height: panelSize.height - 100 } : undefined}>
                <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
                  <Table className="table-fixed text-body-s w-full">
                    <TableBody>
                      {!hasExchangePermission ? (
                        <ExchangePermissionGate exchange={exchangePlatform} colSpan={table.getVisibleLeafColumns().length} />
                      ) : isLoading || !Object.keys(tickers).length ? (
                        <tr>
                          <td colSpan={table.getVisibleLeafColumns().length}>
                            <div className={`${wideSize ? 'h-[500px]' : 'h-[330px]'} grid place-content-center`}>
                              <Loader2 className={'w-5 h-5 animate-spin text-fg-subtle hover:bg-transparent'} />
                            </div>
                          </td>
                        </tr>
                      ) : !table.getRowModel().rows.length && columnFilters.length ? (
                        <tr>
                          <td colSpan={table.getVisibleLeafColumns().length} className="py-10 text-center text-body-s text-fg-subtle">
                            {t('noSearchResults')}
                          </td>
                        </tr>
                      ) : (
                        <>
                          {table.getTopRows()?.map((row, index, topRows) => (
                            <TableRow
                              className={`border-transparent sticky bg-layer-raised z-48 cursor-grab active:cursor-grabbing ${draggingId === row.id ? 'opacity-50' : ''}`}
                              key={row.id}
                              data-state={row.getIsSelected() && 'selected'}
                              data-favorite-row={row.id}
                              draggable
                              onDragStart={event => {
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', row.id);
                                setDraggingId(row.id);
                              }}
                              onDragOver={event => {
                                if (!draggingId) return;
                                event.preventDefault();
                                if (draggingId !== row.id) moveFavorite(draggingId, row.id);
                              }}
                              onDrop={event => event.preventDefault()}
                              onDragEnd={() => setDraggingId(null)}
                              onKeyDown={event => {
                                // 별 버튼에 포커스가 있을 때 Alt+↑↓로 순서를 바꾼다.
                                if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
                                const target = topRows[index + (event.key === 'ArrowUp' ? -1 : 1)];
                                if (!target) return;
                                event.preventDefault();
                                moveFavorite(row.id, target.id);
                                requestAnimationFrame(() =>
                                  document
                                    .querySelector<HTMLButtonElement>(`[data-favorite-row="${CSS.escape(row.id)}"] button[aria-pressed]`)
                                    ?.focus(),
                                );
                              }}>
                              {row.getVisibleCells().map(cell => {
                                const adjustedWidth = getColumnWidth(cell.column.id);
                                return (
                                  <TableCell
                                    key={cell.id}
                                    style={{
                                      width: adjustedWidth,
                                      minWidth: adjustedWidth,
                                      maxWidth: adjustedWidth,
                                      overflow: 'hidden',
                                      wordBreak: 'break-all', // 단어 단위 줄바꿈
                                    }}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                          {virtualizer.getVirtualItems()?.map((virtualRow, index) => {
                            const row = centerRows[virtualRow.index];
                            return (
                              <TableRow
                                style={{
                                  height: '48px', // 행 높이 고정
                                  transform: `translateY(${virtualRow.start - index * virtualRow.size}px)`,
                                }}
                                className="border-transparent"
                                key={row.id}
                                data-state={row.getIsSelected() && 'selected'}>
                                {row.getVisibleCells().map(cell => {
                                  const adjustedWidth = getColumnWidth(cell.column.id);
                                  return (
                                    <TableCell
                                      key={cell.id}
                                      style={{
                                        width: adjustedWidth,
                                        minWidth: adjustedWidth,
                                        maxWidth: adjustedWidth,
                                        overflow: 'hidden',
                                        wordBreak: 'break-all',
                                      }}>
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {updatedVersion ? (
                <WhatsNew updatedVersion={updatedVersion} onDismiss={() => setUpdatedVersion('')} />
              ) : (
                <ReviewPrompt />
              )}
              <Suspense fallback={null}>
                <Onboarding
                  exchangePlatform={exchangePlatform}
                  setExchangePlatform={selectExchange}
                  setFavoriteCoins={setFavoriteCoins}
                />
              </Suspense>
            </main>
          </div>
        </ThemeProvider>
      </ChartProvider>
      </WalletStatusContext.Provider>
    </MarketContext.Provider>
  );
};

export default App;
