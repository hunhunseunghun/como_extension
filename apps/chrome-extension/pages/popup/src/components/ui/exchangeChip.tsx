import { cn } from '@/lib/utils';

type Props = {
  logo: string;
  label: string;
  selected: boolean;
  onClick: () => void;
};

// 거래소 로고 하나를 고르는 칩. v2는 선택 칸을 회색 면으로, v1은 3.0.0처럼 테두리로 표시한다.
export const ExchangeChip = ({ logo, label, selected, onClick }: Props) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={selected}
    onClick={onClick}
    className={cn(
      'inline-flex size-6 shrink-0 items-center justify-center rounded-sm transition-[opacity,background-color] duration-(--como-duration-d2) hover:cursor-pointer focus-visible:outline-2 focus-visible:outline-stroke-focus',
      selected ? 'bg-chip-selected opacity-100 ring-1 ring-chip-ring' : 'opacity-60 hover:opacity-100',
    )}>
    <img src={logo} alt="" className="size-4" />
  </button>
);
