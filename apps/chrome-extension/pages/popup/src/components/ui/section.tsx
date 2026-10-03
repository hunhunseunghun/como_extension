import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// 팝오버 안의 묶음. 제목은 작은 회색 글자, 묶음 사이는 선으로 나눈다.
export const Section = ({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn('py-1 not-first:border-t', className)}>
    {title && <h3 className="px-1 pb-1 text-cap-s font-semibold text-fg-subtle">{title}</h3>}
    {children}
  </section>
);

// 한 줄 설정: 왼쪽 이름(필요하면 설명), 오른쪽 컨트롤.
export const SettingRow = ({
  label,
  description,
  htmlFor,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) => (
  <div className="flex min-h-8 items-center justify-between gap-3 px-1 py-0.5">
    <div className="flex min-w-0 flex-col">
      <label htmlFor={htmlFor} className="text-cap text-fg-neutral">
        {label}
      </label>
      {description && <span className="text-cap-xs text-fg-subtle">{description}</span>}
    </div>
    {children}
  </div>
);
