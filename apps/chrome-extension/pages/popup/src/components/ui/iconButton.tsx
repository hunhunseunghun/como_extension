import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// 목록 행의 삭제처럼 작은 아이콘 동작. 읽을 이름(aria-label)을 꼭 준다.
export const IconButton = ({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={cn(
      'inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle transition-colors duration-(--como-duration-d2) hover:cursor-pointer hover:bg-neutral-weak hover:text-fg-neutral focus-visible:outline-2 focus-visible:outline-stroke-focus [&_svg]:size-3',
      className,
    )}
    {...props}>
    {children}
  </button>
);
