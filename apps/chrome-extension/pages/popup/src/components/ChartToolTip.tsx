import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, Time } from 'lightweight-charts';

// 차트 라이브러리는 차트를 처음 열 때만 불러와 팝업 초기 번들을 줄인다.
let chartLibPromise: Promise<typeof import('lightweight-charts')> | null = null;
const loadChartLib = () => (chartLibPromise ??= import('lightweight-charts'));
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import React from 'react';
import { useChartData } from '@/hooks/useChartData';
import { useI18n, type MessageKey } from '@/i18n';
import type { ExchangePlatform } from '@/types';
import { useStoredValue } from '@/hooks/useStoredFlag';
import { bigMoves, bollinger, newsNear, rsi, sma, timeframeSeconds, type BigMove, type Candle, type NewsItem } from '@/lib/indicators';
import { loadGrantedNews } from '@/lib/news';

// 보조지표 켜기·끄기(모든 차트에 같이 적용, 저장해 둔다)
type Indicators = { ma: boolean; bb: boolean; rsi: boolean };
const DEFAULT_INDICATORS: Indicators = { ma: false, bb: false, rsi: false };
const INDICATOR_KEYS = ['ma', 'bb', 'rsi'] as const;
const INDICATOR_LABEL: Record<(typeof INDICATOR_KEYS)[number], string> = { ma: 'MA', bb: 'BB', rsi: 'RSI' };
const coinOfSymbol = (symbol?: string) =>
  !symbol ? '' : symbol.includes('-') ? symbol.split('-')[1] : symbol.replace(/(USDT|USDC|USD|INR|BTC)$/, '');

interface ChartTooltipProps {
  children: React.ReactNode;
  className: string;
  symbol?: string;
  exchange?: ExchangePlatform;
  wideSize: boolean;
  timeframe: string;
  // 급등락 봉 뉴스를 고를 때 쓰는 코인 이름(한글·영문)
  names?: string[];
}

const formatPrice = (price: number): string => {
  const absPrice = Math.abs(price);

  const formatFixed = (num: number, digits: number) => num.toFixed(digits).replace(/\.?0+$/, '');

  if (absPrice >= 1_000_000_000) {
    return `${formatFixed(price / 1_000_000_000, 2)}B`;
  } else if (absPrice >= 1_000_000) {
    return `${formatFixed(price / 1_000_000, 2)}M`;
  } else if (absPrice >= 1_000) {
    return `${formatFixed(price / 1_000, 2)}K`;
  } else if (absPrice >= 1) {
    return formatFixed(price, 2);
  } else {
    return formatFixed(price, 9); // 소수일 경우 최대 9자리
  }
};

// 전역 상태 관리를 위한 Context
const ChartContext = React.createContext<{
  activeChart: string | null;
  setActiveChart: (symbol: string | null) => void;
}>({
  activeChart: null,
  setActiveChart: () => {},
});

const getTimeframeConfig = (timeframe: string) => {
  switch (timeframe) {
    case '1m':
    case '3m':
    case '5m':
    case '10m':
    case '15m':
    case '30m':
      return {
        dateFormat: 'HH:mm',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          return date.toLocaleTimeString('ko-KR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
        },
        timeVisible: true,
        secondsVisible: false,
      };
    case '60m':
    case '240m':
      return {
        dateFormat: "yyyy/MM/dd HH'H'",
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hour = String(date.getHours()).padStart(2, '0');
          return `${year}/${month}/${day} ${hour}H`;
        },
        timeVisible: true,
        secondsVisible: false,
      };
    case '1d':
      return {
        dateFormat: 'yyyy/MM/dd',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}/${month}/${day}`;
        },
        timeVisible: false,
        secondsVisible: false,
      };
    case '1M':
      return {
        dateFormat: 'yyyy/MM',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          return `${year}/${month}`;
        },
        timeVisible: false,
        secondsVisible: false,
      };
    default:
      return {
        dateFormat: 'yyyy/MM/dd',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          return date.toLocaleDateString('ko-KR', { timeZone: 'UTC' });
        },
        timeVisible: false,
        secondsVisible: false,
      };
  }
};

const ChartToolTip: React.FC<ChartTooltipProps> = ({
  children,
  className,
  symbol,
  exchange = 'binance',
  wideSize,
  timeframe,
  names = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  // 보조지표 선(이름 → 시리즈)과 급등락 표시
  const overlayRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const movesRef = useRef<BigMove[]>([]);
  const newsRef = useRef<NewsItem[]>([]);
  const newsGrantedRef = useRef(false);
  const [indicators, setIndicators] = useStoredValue<Indicators>('chartIndicators', DEFAULT_INDICATORS);
  const [hoverMove, setHoverMove] = useState<{ move: BigMove; news: NewsItem[]; newsOn: boolean } | null>(null);
  // 마우스 이벤트 처리기는 차트를 만들 때 한 번 붙이므로 최신 값은 ref로 읽는다.
  const hoverContext = {
    keywords: [coinOfSymbol(symbol), ...names],
    interval: timeframeSeconds(timeframe),
    marketWide: coinOfSymbol(symbol) === 'BTC',
  };
  const hoverContextRef = useRef(hoverContext);
  hoverContextRef.current = hoverContext;
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;
  const { chartData, loading, error, fetchData, cancel } = useChartData(symbol, exchange, timeframe);
  const { activeChart, setActiveChart } = React.useContext(ChartContext);
  const { t } = useI18n();

  // 차트를 닫는다. 진행 중인 요청·재시도도 멈춘다.
  const closeChart = useCallback(() => {
    cancel();
    setIsOpen(false);
    setActiveChart(null);
    chartRef.current?.remove();
    chartRef.current = null;
    seriesRef.current = null;
    overlayRef.current.clear();
    markersRef.current = null;
    setHoverMove(null);
    setPosition(null);
  }, [cancel, setActiveChart]);

  const TOOLTIP_WIDTH = wideSize ? 500 : 290;
  const TOOLTIP_HEIGHT = wideSize ? 300 : 170;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && containerRef.current) {
        const tooltipElement = document.querySelector('.tooltip');
        if (tooltipElement && !tooltipElement.contains(event.target as Node)) closeChart();
      }
    };
    // Esc로 닫고, 키보드로 열었던 자리로 포커스를 돌려 준다.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeChart();
      containerRef.current?.focus();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeChart]);

  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const newLeft = Math.max(0, Math.min(rect.left + window.scrollX, window.innerWidth - TOOLTIP_WIDTH));
    const newTop =
      rect.top + window.scrollY + TOOLTIP_HEIGHT > window.innerHeight
        ? rect.top + window.scrollY - TOOLTIP_HEIGHT
        : rect.top + window.scrollY + rect.height;

    const adjustedTop = Math.max(0, newTop);
    setPosition(prev =>
      prev && prev.left === newLeft && prev.top === adjustedTop ? prev : { left: newLeft, top: adjustedTop },
    );
  }, []);

  // 보조지표와 급등락 표시를 다시 그린다. 지표를 켜고 끌 때도 부른다.
  const applyOverlays = useCallback(async () => {
    const chart = chartRef.current;
    const candleSeries = seriesRef.current;
    if (!chart || !candleSeries || !chartData.length) return;
    const { LineSeries, createSeriesMarkers } = await loadChartLib();
    const candles = chartData as unknown as Candle[];
    const rootStyle = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback;
    const lines = overlayRef.current;
    const setLine = (name: string, data: { time: number; value: number }[], options: Record<string, unknown>, pane = 0) => {
      let line = lines.get(name);
      if (!line) {
        line = chart.addSeries(
          LineSeries,
          { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...options },
          pane,
        );
        lines.set(name, line);
      }
      line.setData(data as { time: Time; value: number }[]);
    };
    const dropLine = (name: string) => {
      const line = lines.get(name);
      if (line) chart.removeSeries(line);
      lines.delete(name);
    };
    if (indicators.ma) {
      setLine('ma20', sma(candles, 20), { color: token('--como-chart-ma1', '#f59e0b') });
      setLine('ma60', sma(candles, 60), { color: token('--como-chart-ma2', '#a855f7') });
    } else {
      dropLine('ma20');
      dropLine('ma60');
    }
    if (indicators.bb) {
      const band = bollinger(candles, 20, 2);
      const color = token('--como-chart-band', 'rgba(120, 144, 156, 0.9)');
      setLine('bbUpper', band.upper, { color, lineStyle: 2 });
      setLine('bbLower', band.lower, { color, lineStyle: 2 });
    } else {
      dropLine('bbUpper');
      dropLine('bbLower');
    }
    if (indicators.rsi) {
      setLine('rsi', rsi(candles, 14), { color: token('--como-chart-rsi', '#14b8a6'), priceFormat: { type: 'price', precision: 0, minMove: 1 } }, 1);
      const rsiLine = lines.get('rsi')!;
      if (!rsiLine.priceLines().length) {
        const guide = token('--como-chart-grid', '#888888');
        rsiLine.createPriceLine({ price: 70, color: guide, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
        rsiLine.createPriceLine({ price: 30, color: guide, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
      }
      chart.panes()[1]?.setHeight(Math.round(TOOLTIP_HEIGHT * 0.3));
    } else {
      dropLine('rsi');
    }
    // 급등락 봉 표시(평소보다 크게 움직인 봉 최대 3개)
    const moves = bigMoves(candles);
    movesRef.current = moves;
    // 근처 뉴스는 권한을 켠 피드만, 5분 캐시(lib/news)
    if (moves.length)
      loadGrantedNews().then(({ items, granted }) => {
        newsRef.current = items;
        newsGrantedRef.current = granted;
      });
    const markers = moves.map(move => ({
      time: move.time as Time,
      position: move.change >= 0 ? ('aboveBar' as const) : ('belowBar' as const),
      shape: move.change >= 0 ? ('arrowDown' as const) : ('arrowUp' as const),
      color: move.change >= 0 ? token('--como-up', '#ef4444') : token('--como-down', '#3b82f6'),
      text: `${move.change >= 0 ? '+' : ''}${move.change.toFixed(1)}%`,
    }));
    if (markersRef.current) markersRef.current.setMarkers(markers);
    else markersRef.current = createSeriesMarkers(candleSeries, markers);
  }, [chartData, indicators]); // eslint-disable-line react-hooks/exhaustive-deps
  // renderChart는 chartData가 바뀔 때만 새로 만들어진다. 캐시로 같은 데이터를 다시 열면 예전 지표 설정을 들고 있으므로
  // 늘 최신 applyOverlays를 ref로 부른다.
  const applyOverlaysRef = useRef(applyOverlays);
  applyOverlaysRef.current = applyOverlays;

  // 지표 설정이 바뀌면 열린 차트에 바로 반영한다.
  useEffect(() => {
    if (isOpen && chartRef.current) applyOverlays();
  }, [indicators, isOpen, applyOverlays]);

  const renderChart = useCallback(async () => {
    if (!chartData.length) return;
    const { createChart, CandlestickSeries } = await loadChartLib();
    const chartContainer = document.querySelector('.chart-container') as HTMLDivElement;
    // 라이브러리를 불러오는 사이 툴팁이 닫혔으면 차트를 만들지 않는다.
    if (!isOpenRef.current || !chartContainer) return;

    if (!chartRef.current) {
      // 상승·하락 색과 차트 패널 색·글자 크기는 디자인 토큰(CSS 변수)에서 읽는다.
      const rootStyle = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback;
      const upColor = token('--como-up', '#ef4444');
      const downColor = token('--como-down', '#3b82f6');
      const gridColor = token('--como-chart-grid', 'rgba(255, 255, 255, 0.2)');
      const borderColor = token('--como-chart-border', '#2b2b43');
      const fontSize = parseFloat(token(wideSize ? '--como-chart-font' : '--como-chart-font-compact', '11'));
      chartRef.current = createChart(chartContainer, {
        width: TOOLTIP_WIDTH,
        height: TOOLTIP_HEIGHT,
        layout: {
          background: { color: 'transparent' },
          textColor: token('--como-fg-chart', '#d1d4dc'),
          fontSize,
          attributionLogo: false,
        },
        grid: {
          vertLines: {
            style: 2,
            visible: true,
            color: gridColor,
          },
          horzLines: {
            style: 2,
            visible: true,
            color: gridColor,
          },
        },
        rightPriceScale: {
          visible: true,
          borderVisible: true,
          borderColor,
          entireTextOnly: true,
        },
        localization: {
          priceFormatter: formatPrice,
        },
        timeScale: { visible: true, borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 20 },
        crosshair: { mode: 0 },
        handleScroll: true,
        handleScale: true,
      });
      // 급등락 봉에 마우스를 올리면 그 시각 근처 뉴스를 보여 준다(뉴스 권한을 켠 경우).
      chartRef.current.subscribeCrosshairMove(param => {
        const move = movesRef.current.find(item => item.time === Number(param.time));
        const { keywords, interval, marketWide } = hoverContextRef.current;
        setHoverMove(
          move
            ? { move, news: newsNear(newsRef.current, move, interval, keywords, marketWide).slice(0, 2), newsOn: newsGrantedRef.current }
            : null,
        );
      });
      seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
        upColor,
        downColor,
        borderVisible: false,
        wickUpColor: upColor,
        wickDownColor: downColor,
      });
    }

    seriesRef.current!.setData(chartData);
    await applyOverlaysRef.current();
    const config = getTimeframeConfig(timeframe);
    chartRef.current!.applyOptions({
      localization: {
        dateFormat: config.dateFormat,
        timeFormatter: config.timeFormatter,
      },
      timeScale: {
        timeVisible: config.timeVisible,
        secondsVisible: config.secondsVisible,
      },
    });
    chartRef.current?.timeScale().fitContent();
  }, [chartData]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = () => {
      if (!isOpen) {
        setIsOpen(true);
        setActiveChart(symbol || null);
        fetchData();
        updatePosition();
      }
    };

    // 키보드로도 연다(Enter·Space).
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      handleClick();
    };

    container.addEventListener('click', handleClick);
    container.addEventListener('keydown', handleKey);
    return () => {
      container.removeEventListener('click', handleClick);
      container.removeEventListener('keydown', handleKey);
    };
  }, [fetchData, updatePosition, isOpen, symbol, setActiveChart]);

  useEffect(() => {
    if (isOpen) {
      const handleEvents = () => updatePosition();
      window.addEventListener('scroll', handleEvents);
      window.addEventListener('resize', handleEvents);
      return () => {
        window.removeEventListener('scroll', handleEvents);
        window.removeEventListener('resize', handleEvents);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (isOpen && chartData.length && !loading && !error) {
      renderChart();
    }
  }, [isOpen, chartData, loading, error, renderChart]);

  useEffect(() => {
    if (isOpen && activeChart && activeChart !== symbol) {
      cancel();
      setIsOpen(false);
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      overlayRef.current.clear();
      markersRef.current = null;
      setHoverMove(null);
      setPosition(null);
    }
  }, [activeChart, symbol, isOpen, cancel]);

  const chartSummary = useMemo(() => {
    if (!chartData.length) return undefined;
    const first = chartData[0].open;
    const last = chartData[chartData.length - 1].close;
    const change = first ? ((last - first) / first) * 100 : 0;
    return t('chartSummary')
      .replace('{symbol}', symbol ?? '')
      .replace('{last}', formatPrice(last))
      .replace('{change}', `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`)
      .replace('{high}', formatPrice(Math.max(...chartData.map(point => point.high))))
      .replace('{low}', formatPrice(Math.min(...chartData.map(point => point.low))));
  }, [chartData, symbol, t]);

  const tooltipContent = useMemo(
    () => (
      <div
        className={cn(
          'tooltip absolute bg-chart border border-(--como-chart-panel-border) shadow-lg rounded-lg z-51 p-1',
          wideSize ? 'w-[505px] h-[300px]' : 'w-[300px] h-[170px]',
        )}
        style={position ? { left: `${position.left}px`, top: `${position.top}px` } : { display: 'none' }}>
        <div
          className="chart-container w-full h-full"
          // 캔버스는 화면 낭독기가 읽지 못해 마지막 가격·구간 등락·고가·저가를 글로 함께 준다.
          role="img"
          aria-label={chartSummary}
          style={{ display: chartData.length && !loading && !error ? 'block' : 'none' }}
        />
        {chartData.length > 0 && !loading && !error && (
          <div className="absolute left-1.5 top-1 z-10 flex gap-0.5" data-testid="chart-indicators">
            {INDICATOR_KEYS.map(key => (
              <button
                key={key}
                type="button"
                aria-pressed={indicators[key]}
                title={t(`indicator_${key}` as MessageKey)}
                onMouseDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  setIndicators({ ...indicators, [key]: !indicators[key] });
                }}
                className={cn(
                  'rounded px-1 text-cap leading-4 hover:cursor-pointer',
                  indicators[key]
                    ? 'bg-chart-fg text-chart'
                    : 'border border-(--como-chart-panel-border) bg-chart/70 text-chart-fg-muted',
                )}>
                {INDICATOR_LABEL[key]}
              </button>
            ))}
          </div>
        )}
        {hoverMove && (
          <div
            className="absolute inset-x-1 bottom-1 z-10 truncate rounded bg-chart/90 px-1.5 py-0.5 text-cap leading-4 text-chart-fg"
            data-testid="chart-move">
            <span className={hoverMove.move.change >= 0 ? 'text-up' : 'text-down'}>
              {hoverMove.move.change >= 0 ? '▲ +' : '▼ '}
              {hoverMove.move.change.toFixed(1)}%
            </span>{' '}
            {hoverMove.news.length ? (
              hoverMove.news.map(item => (
                <button
                  key={item.link}
                  type="button"
                  className="block w-full truncate text-left hover:cursor-pointer hover:underline"
                  onMouseDown={event => event.stopPropagation()}
                  onClick={() => item.link.startsWith('http') && chrome.tabs.create({ url: item.link })}>
                  {item.title}
                </button>
              ))
            ) : (
              <span className="text-chart-fg-muted">{t(hoverMove.newsOn ? 'chartMoveNoRelatedNews' : 'chartMoveNoNews')}</span>
            )}
          </div>
        )}
        {(loading || error || !chartData.length) && (
          <div className="w-full h-full flex items-center justify-center text-chart-fg">
            {loading && (
              <div className="w-6 h-6 border-2 border-t-2 border-chart-fg-muted border-t-chart-fg rounded-full animate-spin" />
            )}
            {error && (
              <div className="flex items-center">
                <span className="text-chart-fg-error">{error}</span>
                <button className="ml-2 text-chart-fg underline hover:text-fg-neutral" onClick={() => fetchData()}>
                  {t('retry')}
                </button>
              </div>
            )}
            {!loading && !error && !chartData.length && (
              <a href="https://www.tradingview.com" className="text-chart-fg-muted" target="_blank" rel="noopener noreferrer">
                {t('noChartData')}
              </a>
            )}
          </div>
        )}
      </div>
    ),
    [position, chartData, loading, error, fetchData, wideSize, t, indicators, setIndicators, hoverMove, chartSummary],
  );

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      aria-label={`${t('openChart')} ${symbol ?? ''}`}
      aria-expanded={isOpen}
      className={`${className} relative transition-all duration-500 ease-out cursor-pointer`}>
      {children}
      {isOpen && createPortal(tooltipContent, document.body)}
    </div>
  );
};

// Context Provider 컴포넌트
export const ChartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeChart, setActiveChart] = useState<string | null>(null);

  return <ChartContext.Provider value={{ activeChart, setActiveChart }}>{children}</ChartContext.Provider>;
};

export default ChartToolTip;
