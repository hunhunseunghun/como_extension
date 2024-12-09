import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';

type Exchange = 'binance' | 'upbit' | 'bithumb';

interface ChartDataPoint {
  x: number; // 초 단위 타임스탬프
  y: number; // 가격
}

interface ChartCellProps {
  symbol: string;
  exchange: Exchange;
}

const requestQueue: Array<() => Promise<void>> = [];
let isProcessing = false;

const processQueue = async () => {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;
  const request = requestQueue.shift();
  if (request) {
    await request();
    setTimeout(() => {
      isProcessing = false;
      processQueue();
    }, 1000);
  } else {
    isProcessing = false;
  }
};

const ChartCell: React.FC<ChartCellProps> = ({ symbol, exchange }) => {
  const chartContainerRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChartData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`https://api.upbit.com/v1/candles/days?market=${symbol}&count=30`, {
          headers: { accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(`Invalid or empty response for ${symbol}`);
        }

        const formatData = (data: any[]): ChartDataPoint[] => {
          return data
            .map(item => {
              const timestampInSeconds = Math.floor(new Date(item.candle_date_time_utc).getTime() / 1000);
              const price = item.trade_price;
              if (
                Number.isFinite(timestampInSeconds) &&
                timestampInSeconds > 0 &&
                Number.isFinite(price) &&
                price > 0
              ) {
                return { x: timestampInSeconds, y: price };
              }
              return null;
            })
            .filter((item): item is ChartDataPoint => item !== null)
            .sort((a, b) => a.x - b.x);
        };

        const chartData = formatData(data);

        if (chartData.length === 0) {
          throw new Error(`No valid data points for ${symbol}`);
        }

        if (chartContainerRef.current) {
          if (chartRef.current) {
            chartRef.current.destroy();
          }

          chartRef.current = new Chart(chartContainerRef.current, {
            type: 'line',
            data: {
              datasets: [
                {
                  data: chartData,
                  borderColor: '#ef4444',
                  borderWidth: 1,
                  pointRadius: 0, // 포인트 숨김
                  fill: false,
                },
              ],
            },
            options: {
              responsive: false,
              maintainAspectRatio: false,
              scales: {
                x: {
                  type: 'linear',
                  display: true,
                  ticks: {
                    display: false, // X축 텍스트 숨김
                  },
                  grid: {
                    display: false, // X축 그리드 라인 숨김
                  },
                  min: chartData[0]?.x,
                  max: chartData[chartData.length - 1]?.x,
                },
                y: {
                  display: true,
                  ticks: {
                    display: false, // Y축 텍스트 숨김
                  },
                  grid: {
                    display: false, // Y축 그리드 라인 숨김
                  },
                },
              },
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  enabled: false, // 툴팁 비활성화
                },
              },
              animation: false,
              events: [], // 모든 마우스 이벤트 비활성화 (클릭, 호버 등)
            },
          });

          setHasData(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setHasData(false);
      } finally {
        setIsLoading(false);
      }
    };

    requestQueue.push(fetchChartData);
    processQueue();

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [symbol, exchange]);

  return (
    <div style={{ width: '113px', height: '48px', position: 'relative', overflow: 'hidden' }}>
      <canvas ref={chartContainerRef} width={113} height={48} />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.1)' }}>
          <div className="w-6 h-6 border-2 border-t-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
        </div>
      )}
      {!isLoading && error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500">
          <span>{error}</span>
        </div>
      )}
      {!isLoading && !error && !hasData && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <span>No data available</span>
        </div>
      )}
    </div>
  );
};

export default ChartCell;
