import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  // 아이콘만 있는 선택지는 읽을 이름을 따로 준다.
  ariaLabel?: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  // tabs: 아래 내용을 바꾸는 탭(role=tab), toggle: 값 선택(aria-pressed)
  variant?: 'toggle' | 'tabs';
  // fill: 줄 너비를 나눠 가진다(탭), 기본은 내용 너비
  fill?: boolean;
  className?: string;
  itemClassName?: string;
};

// 세그먼트 컨트롤: 2~4개 중 하나를 고른다. v2는 회색 트랙 위 흰 칸, v1은 3.0.0의 버튼 묶음 모양.
export const Segmented = <T extends string>({
  value,
  onChange,
  options,
  variant = 'toggle',
  fill = false,
  className,
  itemClassName,
}: Props<T>) => (
  <div
    role={variant === 'tabs' ? 'tablist' : 'group'}
    className={cn('inline-flex shrink-0 gap-0.5 rounded-md bg-seg-track p-0.5', fill && 'flex w-full', className)}>
    {options.map(option => {
      const selected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role={variant === 'tabs' ? 'tab' : undefined}
          aria-selected={variant === 'tabs' ? selected : undefined}
          aria-pressed={variant === 'toggle' ? selected : undefined}
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-sm border px-2 text-cap font-medium whitespace-nowrap transition-colors duration-(--como-duration-d2) ease-como hover:cursor-pointer focus-visible:outline-2 focus-visible:outline-stroke-focus [&_svg]:size-3.5',
            fill && 'flex-1',
            selected
              ? 'border-transparent bg-seg-thumb text-seg-thumb-fg shadow-seg'
              : 'border-seg-item-border text-seg-item-fg hover:text-fg-neutral',
            itemClassName,
          )}>
          {option.label}
        </button>
      );
    })}
  </div>
);
