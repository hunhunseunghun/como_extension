import type { ReactNode } from 'react';
import type { Column } from '@tanstack/react-table';
import { ChevronsUpDown, Star } from 'lucide-react';

// 세 거래소 컬럼이 함께 쓰는 헤더·셀 조각. 키보드로도 쓸 수 있게 버튼으로 만든다.

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
