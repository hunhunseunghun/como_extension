import { createContext, useContext } from 'react';
import { CirclePause } from 'lucide-react';
import { useI18n } from '@/i18n';

// 거래소별로 입금·출금이 멈춘 코인만 담는다. { bithumb: { XRP: { deposit: false, withdraw: true } } }
export type WalletStatus = Record<string, Record<string, { deposit: boolean; withdraw: boolean }>>;

export const WalletStatusContext = createContext<WalletStatus>({});

// 입출금이 멈춘 코인 옆에 붙는 표시. 거래소 간 가격 차이로 사고팔기 전에 확인하는 정보다.
export const WalletStatusBadge = ({ exchange, coin }: { exchange: string; coin: string }) => {
  const { t } = useI18n();
  const status = useContext(WalletStatusContext)[exchange]?.[coin];
  if (!status) return null;
  const label =
    !status.deposit && !status.withdraw
      ? t('walletBothSuspended')
      : !status.deposit
        ? t('walletDepositSuspended')
        : t('walletWithdrawSuspended');
  return (
    <span role="img" aria-label={label} title={label} className="flex shrink-0 items-center text-warning">
      <CirclePause className="size-3" />
    </span>
  );
};
