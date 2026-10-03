import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // v2: 테두리 없는 회색 필드, v1: 3.0.0의 테두리 + 그림자 (토큰 --como-field-*)
          'flex h-9 w-full rounded-md border border-field-border bg-field px-2 py-3 shadow-(--como-field-shadow) transition-colors duration-(--como-duration-d2) hover:bg-field-hover file:border-0 file:bg-transparent file:text-body file:font-medium file:text-foreground placeholder:text-(--como-field-placeholder) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--como-field-focus) disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
