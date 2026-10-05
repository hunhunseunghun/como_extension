import type { ReactNode } from 'react';
import type { Column } from '@tanstack/react-table';
import { ChartCandlestick, ChevronDown, ChevronsUpDown, Star } from 'lucide-react';
import { getTimeframes, type Translate } from '@/i18n';
import type { ExchangePlatform } from '@/types';
import ChartToolTip from '@/components/ChartToolTip';
import { Sparkline } from '@/components/Sparkline';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// 거래소 컬럼이 함께 쓰는 헤더·셀 조각. 키보드로도 쓸 수 있게 버튼으로 만든다.

// 정렬 헤더: 누를 때마다 오름차순 ↔ 내림차순. 정렬 상태(aria-sort)는 App의 th에 단다.
export const SortableHeader = <T,>({ column, label }: { column: Column<T, unknown>; label: ReactNode }) => (
  <button
    type="button"
    className="flex w-full items-center justify-end font-bold hover:cursor-pointer"
    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
    <span>{label}</span>
    <ChevronsUpDown size={12} strokeWidth={3} className="mt-[1px]" aria-hidden />
  </button>
);

// 즐겨찾기 별: 누르면 상단 고정을 켜고 끈다.
export const FavoriteStar = ({ pinned, onToggle, label }: { pinned: boolean; onToggle: () => void; label: string }) => (
  <button type="button" aria-label={label} aria-pressed={pinned} onClick={onToggle} className="mt-[2px] flex h-3 hover:cursor-pointer">
    <Star
      className={
        pinned ? 'size-3 text-star fill-star' : 'size-3 text-fg-faint hover:text-star hover:fill-star'
      }
    />
  </button>
);

// 차트 열 머리: 봉 길이 고르기
export const TimeframeHeader = ({
  timeframe,
  setTimeframe,
  t,
}: {
  timeframe: string;
  setTimeframe: (value: string) => void;
  t: Translate;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="h-5 w-12 text-cap-s font-semibold gap-1 hover:cursor-pointer">
        <span>{getTimeframes(t).find(tf => tf.value === timeframe)?.label}</span>
        <ChevronDown className="size-2" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="relative left-1 w-13 data-[side=bottom]:slide-in-from-top-2 z-52">
      <DropdownMenuGroup>
        {getTimeframes(t).map(({ value, label }) => (
          <DropdownMenuItem
            key={value}
            textValue={label}
            className="gap-1 px-1 py-1 items-left text-body-s hover:cursor-pointer"
            onSelect={() => setTimeframe(value)}>
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

// 차트 칸: 누르면 큰 차트. 즐겨찾기 행은 아이콘 대신 최근 24시간 미니 차트를 그린다.
export const ChartCell = ({
  symbol,
  exchange,
  timeframe,
  wideSize,
  pinned,
}: {
  symbol: string;
  exchange: ExchangePlatform;
  timeframe: string;
  wideSize: boolean;
  pinned: boolean;
}) => (
  <div className="flex justify-center items-center">
    <ChartToolTip
      className="flex justify-center items-center hover:text-fg-highlight"
      symbol={symbol}
      exchange={exchange}
      timeframe={timeframe}
      wideSize={wideSize}>
      {pinned ? <Sparkline symbol={symbol} exchange={exchange} /> : <ChartCandlestick size={16} />}
    </ChartToolTip>
  </div>
);
