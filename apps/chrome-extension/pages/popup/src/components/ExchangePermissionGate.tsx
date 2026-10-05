import { useCallback, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EXCHANGES } from '@/constants/exchanges';
import { useI18n } from '@/i18n';
import { requestExchangePermission } from '@/lib/exchangePermission';
import type { ExchangePlatform } from '@/types';

// 권한이 없을 때 표 자리에 보여 주는 안내. 브라우저 설정에서 권한을 거둬 갔을 때도 여기서 다시 받는다.
export const ExchangePermissionGate = ({ exchange, colSpan }: { exchange: ExchangePlatform; colSpan: number }) => {
  const { t } = useI18n();
  const [denied, setDenied] = useState(false);
  const name = t(EXCHANGES[exchange].labelKey);
  const request = useCallback(async () => setDenied(!(await requestExchangePermission(exchange))), [exchange]);

  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <KeyRound className="size-5 text-fg-subtle" aria-hidden />
          <p className="text-body-s font-semibold">{t('exchangePermissionTitle').replace('{exchange}', name)}</p>
          <p className="text-cap text-fg-subtle">{t('exchangePermissionBody').replace('{exchange}', name)}</p>
          <Button variant="soft" className="h-control mt-1 text-cap hover:cursor-pointer" onClick={request}>
            {t('exchangePermissionAllow')}
          </Button>
          {denied && <p className="text-cap-s text-fg-critical">{t('exchangePermissionDenied')}</p>}
        </div>
      </td>
    </tr>
  );
};
