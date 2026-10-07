import { useContext, useState } from 'react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/nativeSelect';
import { ExchangeChip } from '@/components/ui/exchangeChip';
import { EXCHANGES } from '@/constants/exchanges';
import { useAllTickers } from '@/hooks/useAllTickers';
import { useI18n } from '@/i18n';
import { arbitrage } from '@/lib/arbitrage';
import { formatFiat } from '@/lib/market';
import { WalletStatusContext } from '@/lib/walletStatusContext';

const KRW_SOURCES = ['upbit', 'bithumb', 'coinone', 'digitalx'] as const;
type KrwSource = (typeof KRW_SOURCES)[number];
// 국내 거래소 기본 수수료(%)
const KRW_FEE: Record<KrwSource, number> = { upbit: 0.05, bithumb: 0.04, coinone: 0.2, digitalx: 0.15 };

const parse = (value: string) => (value.trim() === '' ? 0 : Number(value));

// 김프 차익 계산기: 바이낸스와 국내 거래소 사이로 코인을 옮겼을 때 수수료를 빼고 남는지 본다.
export const ArbitragePanel = () => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  const prices = useAllTickers(true);
  const walletStatus = useContext(WalletStatusContext);
  const [exchange, setExchange] = useState<KrwSource>('upbit');
  const [coin, setCoin] = useState('XRP');
  const [direction, setDirection] = useState<'toKorea' | 'toGlobal'>('toKorea');
  const [amount, setAmount] = useState('1000000');
  const [krwFee, setKrwFee] = useState(String(KRW_FEE.upbit));
  const [globalFee, setGlobalFee] = useState('0.1');
  const [withdrawFee, setWithdrawFee] = useState('0');

  const symbol = coin.trim().toUpperCase();
  const krwPrice = prices[`${exchange}:KRW-${symbol}`]?.currentPrice;
  const usdtPrice = prices[`binance:${symbol}USDT`]?.currentPrice;
  // 테더 원화 가격: 고른 거래소에 없으면 업비트 값을 쓴다.
  const usdtKrw = prices[`${exchange}:KRW-USDT`]?.currentPrice ?? prices['upbit:KRW-USDT']?.currentPrice;
  const result =
    krwPrice && usdtPrice && usdtKrw
      ? arbitrage({
          direction,
          amountKrw: parse(amount),
          krwPrice,
          usdtPrice,
          usdtKrw,
          krwFee: parse(krwFee) / 100,
          globalFee: parse(globalFee) / 100,
          withdrawFee: parse(withdrawFee),
        })
      : null;
  // 받는 쪽 입금·보내는 쪽 출금이 막혔는지(국내 쪽만 알 수 있다)
  const status = walletStatus[exchange]?.[symbol];
  const blocked = status && (direction === 'toKorea' ? !status.deposit : !status.withdraw);
  const krw = (value: number) => formatFiat(value, 'KRW', locale);

  const field = (label: string, value: string, onChange: (value: string) => void) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-cap-s text-fg-subtle">{label}</span>
      <Input aria-label={label} inputMode="decimal" className="num h-control px-2 text-cap-s" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );

  return (
    <div className="flex flex-col gap-1.5 text-cap" data-testid="arbitrage">
      <div className="flex items-center gap-1">
        {KRW_SOURCES.map(key => (
          <ExchangeChip
            key={key}
            logo={EXCHANGES[key].logo}
            label={t(EXCHANGES[key].labelKey)}
            selected={exchange === key}
            onClick={() => {
              setExchange(key);
              setKrwFee(String(KRW_FEE[key]));
            }}
          />
        ))}
        <Input
          aria-label={t('coinSymbol')}
          placeholder={t('coinSymbol')}
          className="h-control flex-1 px-2 text-cap-s"
          value={coin}
          onChange={event => setCoin(event.target.value)}
        />
      </div>
      <NativeSelect aria-label={t('arbDirection')} value={direction} onChange={event => setDirection(event.target.value as typeof direction)}>
        <option value="toKorea">{t('arbToKorea')}</option>
        <option value="toGlobal">{t('arbToGlobal')}</option>
      </NativeSelect>
      <div className="grid grid-cols-2 gap-1">
        {field(t('arbAmount'), amount, setAmount)}
        {field(t('arbWithdrawFee'), withdrawFee, setWithdrawFee)}
        {field(t('arbKrwFee'), krwFee, setKrwFee)}
        {field(t('arbGlobalFee'), globalFee, setGlobalFee)}
      </div>

      {!result && <div className="py-2 text-fg-faint">{t('arbNoPrice')}</div>}
      {result && (
        <div className="rounded-md border border-tile-border bg-tile px-2 py-1.5">
          <div className="flex justify-between">
            <span className="text-fg-subtle">{t('arbPremium')}</span>
            <span className={`num font-medium ${result.premium >= 0 ? 'text-up' : 'text-down'}`}>
              {result.premium >= 0 ? '+' : ''}
              {result.premium.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between text-cap-s text-fg-subtle">
            <span>
              {krw(krwPrice!)} · ${usdtPrice} · USDT {krw(usdtKrw!)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-subtle">{t('arbFinal')}</span>
            <span className="num">{krw(result.finalKrw)}</span>
          </div>
          <div className="flex justify-between font-semibold" data-testid="arb-profit">
            <span>{t('arbProfit')}</span>
            <span className={`num ${result.profit > 0 ? 'text-up' : result.profit < 0 ? 'text-down' : ''}`}>
              {krw(result.profit)} ({result.profitRate >= 0 ? '+' : ''}
              {result.profitRate.toFixed(2)}%)
            </span>
          </div>
        </div>
      )}
      {blocked && <div className="text-cap-s text-warning" data-testid="arb-blocked">{t(direction === 'toKorea' ? 'arbDepositBlocked' : 'arbWithdrawBlocked')}</div>}
      <p className="text-cap-s text-fg-faint">{t('arbHint')}</p>
    </div>
  );
};
