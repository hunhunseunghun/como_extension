import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/nativeSelect';
import { Segmented } from '@/components/ui/segmented';
import { useI18n } from '@/i18n';
import { formatFiat } from '@/lib/market';
import {
  averageAfterBuy,
  breakEvenPrice,
  estimateCryptoTax,
  netProfit,
  quantityForTargetAverage,
  TAX_BASELINE_DATE,
  TAX_DEDUCTION_KRW,
} from '@/lib/portfolioCalc';
import type { ExchangePlatform } from '@/types';

export type ToolHolding = { id: string; exchange: ExchangePlatform; market: string; quantity: number; avgPrice: number };
type Quote = 'KRW' | 'USD' | 'INR';
type Props = {
  holdings: ToolHolding[];
  prices: Record<string, { currentPrice: number } | undefined>;
  quoteOf: (market: string) => Quote;
  coinOf: (holding: ToolHolding) => string;
};

// 거래소 기본 수수료(%, 일반 등급·원화 마켓 기준). 고칠 수 있게 처음 값만 채운다.
const DEFAULT_FEE: Partial<Record<ExchangePlatform, number>> = {
  upbit: 0.05,
  bithumb: 0.04,
  coinone: 0.2,
  digitalx: 0.15,
  binance: 0.1,
  bybit: 0.1,
  okx: 0.1,
  bitget: 0.1,
  coinbase: 0.6,
  kraken: 0.4,
  coindcx: 0.5,
};

// 2026-12-31 24:00(한국 시각) 직전 1시간 봉의 종가. 업비트·빗썸 차트 API는 같은 모양이다. 다른 원화 거래소는 업비트 가격으로 본다.
const BASELINE_STORAGE_KEY = 'taxBaseline2026';
const BASELINE_TO = '2027-01-01T00:00:00+09:00';
const baselineReady = () => Date.now() >= Date.parse(BASELINE_TO);
const fetchBaseline = async (exchange: ExchangePlatform, market: string) => {
  // 빗썸은 시간대 표기를 받지 않고 한국 시각으로 읽는다. 업비트는 시간대가 없으면 UTC로 읽는다.
  const url =
    exchange === 'bithumb'
      ? `https://api.bithumb.com/v1/candles/minutes/60?market=${market}&to=${encodeURIComponent(BASELINE_TO.slice(0, 19))}&count=1`
      : `https://api.upbit.com/v1/candles/minutes/60?market=${market}&to=${encodeURIComponent(BASELINE_TO)}&count=1`;
  const response = await fetch(url);
  const [candle] = await response.json();
  return Number(candle?.trade_price) || null;
};

const parse = (value: string) => (value.trim() === '' ? NaN : Number(value));

const Calculator = ({ holdings, prices, quoteOf, coinOf }: Props) => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  const [selectedId, setSelectedId] = useState(holdings[0]?.id ?? '');
  const holding = holdings.find(item => item.id === selectedId) ?? holdings[0];
  const price = holding ? prices[`${holding.exchange}:${holding.market}`]?.currentPrice : undefined;
  const quote = holding ? quoteOf(holding.market) : 'KRW';
  const [buyPrice, setBuyPrice] = useState('');
  const [buyQuantity, setBuyQuantity] = useState('');
  const [target, setTarget] = useState('');
  const [fee, setFee] = useState('');

  // 고른 코인이 바뀌면 매수가는 현재가, 수수료는 그 거래소 기본값으로 다시 채운다.
  useEffect(() => {
    setBuyPrice('');
    setTarget('');
    setFee(holding ? String(DEFAULT_FEE[holding.exchange] ?? 0.1) : '');
  }, [holding?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!holding) return <div className="py-2 text-fg-faint">{t('calcNoHolding')}</div>;

  const money = (value: number) => formatFiat(value, quote, locale);
  const buyAt = buyPrice.trim() ? parse(buyPrice) : (price ?? NaN);
  const after = averageAfterBuy(holding.quantity, holding.avgPrice, buyAt, parse(buyQuantity) || 0);
  const needed = quantityForTargetAverage(holding.quantity, holding.avgPrice, buyAt, parse(target));
  const feeRate = parse(fee) / 100;
  const breakEven = Number.isFinite(feeRate) ? breakEvenPrice(holding.avgPrice, feeRate) : null;
  const net = price && Number.isFinite(feeRate) ? netProfit(holding.quantity, holding.avgPrice, price, feeRate) : null;

  const row = (label: string, value: React.ReactNode, testId?: string) => (
    <div className="flex justify-between gap-2 py-0.5" data-testid={testId}>
      <span className="text-fg-subtle">{label}</span>
      <span className="num font-medium text-right">{value}</span>
    </div>
  );
  const field = (label: string, value: string, onChange: (value: string) => void, placeholder?: string) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-cap-s text-fg-subtle">{label}</span>
      <Input
        aria-label={label}
        inputMode="decimal"
        className="num h-control px-2 text-cap-s"
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-1.5" data-testid="calculator">
      <NativeSelect aria-label={t('calcHolding')} value={holding.id} onChange={event => setSelectedId(event.target.value)}>
        {holdings.map(item => (
          <option key={item.id} value={item.id}>
            {coinOf(item)} · {item.quantity} @ {item.avgPrice.toLocaleString(locale)}
          </option>
        ))}
      </NativeSelect>

      <div className="font-semibold">{t('calcAveraging')}</div>
      <div className="grid grid-cols-2 gap-1">
        {field(t('calcBuyPrice'), buyPrice, setBuyPrice, price ? String(price) : undefined)}
        {field(t('calcBuyQuantity'), buyQuantity, setBuyQuantity)}
      </div>
      {after && parse(buyQuantity) > 0 &&
        row(t('calcNewAverage'), `${money(after.avgPrice)} × ${Number(after.quantity.toFixed(8))}`, 'calc-new-average')}
      {after && parse(buyQuantity) > 0 && row(t('calcBuyCost'), money(buyAt * parse(buyQuantity)))}
      {field(t('calcTargetAverage'), target, setTarget)}
      {target.trim() !== '' &&
        row(
          t('calcNeededQuantity'),
          needed != null ? `${Number(needed.toFixed(8))} (${money(needed * buyAt)})` : t('calcImpossible'),
          'calc-needed',
        )}

      <div className="mt-1 border-t pt-1.5 font-semibold">{t('calcBreakEven')}</div>
      <div className="grid grid-cols-2 gap-1">{field(t('calcFee'), fee, setFee)}</div>
      {breakEven != null && row(t('calcBreakEvenPrice'), money(breakEven), 'calc-break-even')}
      {net != null &&
        row(
          t('calcNetProfit'),
          <span className={net > 0 ? 'text-up' : net < 0 ? 'text-down' : ''}>{money(net)}</span>,
          'calc-net',
        )}
      <p className="text-cap-s text-fg-faint">{t('calcFeeHint')}</p>
    </div>
  );
};

const TaxPreview = ({ holdings, prices, coinOf }: Props) => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  // 원화로 산 코인만 계산한다(국내 과세 기준).
  const krwHoldings = useMemo(() => holdings.filter(item => item.market.startsWith('KRW-')), [holdings]);
  const [baselines, setBaselines] = useState<Record<string, number>>({});
  const ready = baselineReady();

  useEffect(() => {
    if (!ready || !krwHoldings.length) return;
    let isUnmounted = false;
    chrome.storage.local.get(BASELINE_STORAGE_KEY, async result => {
      const cached: Record<string, number> = result?.[BASELINE_STORAGE_KEY] ?? {};
      const next = { ...cached };
      for (const item of krwHoldings) {
        const source = item.exchange === 'bithumb' ? 'bithumb' : 'upbit';
        const key = `${source}:${item.market}`;
        if (next[key]) continue;
        const value = await fetchBaseline(source, item.market).catch(() => null);
        if (value) next[key] = value;
      }
      if (isUnmounted) return;
      setBaselines(next);
      chrome.storage.local.set({ [BASELINE_STORAGE_KEY]: next });
    });
    return () => {
      isUnmounted = true;
    };
  }, [ready, krwHoldings]);

  const items = krwHoldings.map(item => {
    const price = prices[`${item.exchange}:${item.market}`]?.currentPrice ?? item.avgPrice;
    const source = item.exchange === 'bithumb' ? 'bithumb' : 'upbit';
    // 12월 31일이 지나기 전에는 지금 가격이 그날 가격이라고 가정한다.
    const baselinePrice = ready ? (baselines[`${source}:${item.market}`] ?? null) : price;
    return { item, price, baselinePrice };
  });
  const result = estimateCryptoTax(items.map(({ item, price, baselinePrice }) => ({ quantity: item.quantity, avgPrice: item.avgPrice, price, baselinePrice })));
  const krw = (value: number) => formatFiat(value, 'KRW', locale);

  return (
    <div className="flex flex-col gap-1" data-testid="tax-preview">
      <p className="text-cap-s text-fg-subtle">
        {(ready ? t('taxIntroAfter') : t('taxIntroBefore')).replace('{date}', TAX_BASELINE_DATE)}
      </p>
      {!krwHoldings.length && <div className="py-2 text-fg-faint">{t('taxNoKrw')}</div>}
      {items.map(({ item, baselinePrice }) => (
        <div key={item.id} className="flex justify-between gap-2 text-cap-s">
          <span className="truncate">{coinOf(item)}</span>
          <span className="num text-fg-subtle">
            {t('taxDeemedCost')} {krw(Math.max(item.avgPrice, baselinePrice ?? item.avgPrice))}
          </span>
        </div>
      ))}
      {krwHoldings.length > 0 && (
        <div className="mt-1 rounded-md border border-tile-border bg-tile px-2 py-1.5">
          <div className="flex justify-between">
            <span className="text-fg-subtle">{t('taxGain')}</span>
            <span className={`num font-medium ${result.gain > 0 ? 'text-up' : result.gain < 0 ? 'text-down' : ''}`}>{krw(result.gain)}</span>
          </div>
          {result.shielded > 0 && (
            <div className="flex justify-between">
              <span className="text-fg-subtle">{t('taxShielded')}</span>
              <span className="num">{krw(result.shielded)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-fg-subtle">{t('taxDeduction')}</span>
            <span className="num">{krw(TAX_DEDUCTION_KRW)}</span>
          </div>
          <div className="flex justify-between font-semibold" data-testid="tax-estimate">
            <span>{t('taxEstimate')}</span>
            <span className="num">{krw(result.tax)}</span>
          </div>
        </div>
      )}
      <p className="text-cap-s text-fg-faint">{t('taxDisclaimer')}</p>
    </div>
  );
};

// 보유 자산 아래 도구: 물타기·손익분기 계산기, 2027 가상자산 과세 미리보기
export const PortfolioTools = (props: Props) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<'calc' | 'tax'>('calc');
  return (
    <div className="mt-2 border-t pt-2 text-cap">
      <Segmented
        variant="tabs"
        fill
        className="mb-2"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'calc', label: t('calcTab') },
          { value: 'tax', label: t('taxTab') },
        ]}
      />
      {tab === 'calc' ? <Calculator {...props} /> : <TaxPreview {...props} />}
    </div>
  );
};
