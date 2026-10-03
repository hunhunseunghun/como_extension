import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// 브라우저 기본 <select>에 v2 필드 모양을 입힌다. 목록이 길어도(언어·통화) 기본 스크롤·검색이 그대로 된다.
export const NativeSelect = ({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <span className="relative inline-flex">
    <select className={cn('como-select', className)} {...props}>
      {children}
    </select>
    <ChevronDown className="como-select-icon size-3.5" aria-hidden />
  </span>
);
