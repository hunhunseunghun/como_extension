import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  // center: 버튼 가운데 아래, end: 버튼 오른쪽 끝에 맞춤(화면 오른쪽 끝 버튼)
  align?: 'center' | 'end';
  tone?: 'default' | 'warning';
  className?: string;
};

// 헤더 버튼 아래에 뜨는 짧은 안내. 부모에 `relative group`이 있어야 hover로 보인다. 부모가 연 팝오버(data-state=open)를 가리지 않게 그동안은 숨긴다.
export const HoverHint = ({ children, align = 'center', tone = 'default', className }: Props) => (
  <span
    role="tooltip"
    className={cn(
      'pointer-events-none absolute top-full mt-2 hidden w-max rounded-md px-2 py-1 text-body-s font-semibold opacity-(--como-hint-opacity) group-hover:block group-data-[state=open]:hidden z-[9999]',
      align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0',
      tone === 'warning' ? 'bg-warning text-on-solid' : 'bg-hint text-hint-fg',
      className,
    )}>
    {children}
  </span>
);
