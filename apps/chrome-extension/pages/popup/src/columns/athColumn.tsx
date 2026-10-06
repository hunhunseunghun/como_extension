import type { MutableRefObject } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Translate } from '@/i18n';
import type { AthMap } from '@/types';
import { SortableHeader } from './shared';

// 역대 최고가 대비(넓은 화면): CoinGecko USD 기준이라 원화·다른 통화 가격과는 조금 다를 수 있다. 없는 코인은 정렬 때 맨 뒤로.
export const athColumn = <T,>(coinOf: (row: T) => string, athRef: MutableRefObject<AthMap>, t: Translate): ColumnDef<T> => ({
  accessorFn: row => athRef.current[coinOf(row)]?.change,
  id: 'ath_diff',
  sortUndefined: 'last',
  header: ({ column }) => <SortableHeader column={column} label={t('fromAth')} />,
  cell: ({ row }) => {
    const item = athRef.current[coinOf(row.original)];
    if (!item) return <div className="flex justify-end text-fg-faint">-</div>;
    return (
      <div className="flex flex-col items-end font-medium whitespace-nowrap text-down" title={t('fromAthHint')} data-testid="ath-cell">
        <span>{item.change.toFixed(1)}%</span>
        <span className="text-cap-s text-fg-subtle">{item.date?.slice(0, 7).replace('-', '.')}</span>
      </div>
    );
  },
});
