import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

// 켜고 끄는 설정. 실제 체크박스라 키보드·스크린리더·테스트(check/uncheck)가 그대로 동작한다.
export const Switch = ({ checked, onCheckedChange, className, ...props }: Props) => (
  <input
    type="checkbox"
    role="switch"
    className={cn('como-switch', className)}
    checked={checked}
    onChange={event => onCheckedChange(event.target.checked)}
    {...props}
  />
);
