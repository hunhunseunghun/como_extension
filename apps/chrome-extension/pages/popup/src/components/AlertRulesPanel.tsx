import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExchangeChip } from '@/components/ui/exchangeChip';
import { IconButton } from '@/components/ui/iconButton';
import { NativeSelect } from '@/components/ui/nativeSelect';
import { MarketPicker } from '@/components/MarketPicker';
import { useAllTickers } from '@/hooks/useAllTickers';
import { usePageVisible } from '@/hooks/usePageVisible';
import { EXCHANGES } from '@/constants/exchanges';
import { useI18n } from '@/i18n';
import type { ExchangePlatform } from '@/types';

// 백그라운드(checkAlertRules)와 같은 형식이다.
// window가 없으면 24시간 등락률(하루 한 번), 있으면 그 분 동안의 급등락(창 길이만큼 쉼)이다.
export type SurgeWindow = 1 | 5 | 15;
export type Direction = 'both' | 'up' | 'down';
export type ChangeRule = {
  id: string;
  type: 'change';
  exchange: ExchangePlatform;
  market: string;
  threshold: number;
  window?: SurgeWindow;
  direction?: Direction;
};
// 대량 체결: 한 번에 minAmount(원화·USDT) 이상 체결되면 알린다(같은 규칙은 30초에 한 번).
export type WhaleRule = {
  id: string;
  type: 'whale';
  exchange: 'upbit' | 'binance';
  market: string;
  minAmount: number;
  direction?: Direction;
};
// 바이낸스 선물 미결제약정의 1시간 변화율
export type OiRule = { id: string; type: 'oi'; symbol: string; threshold: number };
export type KimchiRule = {
  id: string;
  type: 'kimchi';
  exchange: 'upbit' | 'bithumb';
  coin: string;
  above?: number;
  below?: number;
};
export type AlertRule = ChangeRule | KimchiRule | WhaleRule | OiRule;

export const RULES_STORAGE_KEY = 'alertRules';
const RULE_STATE_KEY = 'alertRuleState';

type KimchiItems = Record<string, { premium: number }>;

const SURGE_WINDOWS = [1, 5, 15] as const;
const DIRECTION_SIGN: Record<Direction, string> = { both: '±', up: '▲', down: '▼' };

const DirectionSelect = ({ value, onChange }: { value: Direction; onChange: (value: Direction) => void }) => {
  const { t } = useI18n();
  return (
    <NativeSelect aria-label={t('direction')} value={value} onChange={event => onChange(event.target.value as Direction)}>
      <option value="both">{t('directionBoth')}</option>
      <option value="up">{t('directionUp')}</option>
      <option value="down">{t('directionDown')}</option>
    </NativeSelect>
  );
};

const newId = () =>`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const parseNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));
const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const useRules = () => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  useEffect(() => {
    chrome.storage.local.get(RULES_STORAGE_KEY, result => setRules((result?.[RULES_STORAGE_KEY] as AlertRule[]) ?? []));
  }, []);
  const save = (next: AlertRule[], removedId?: string) => {
    setRules(next);
    chrome.storage.local.set({ [RULES_STORAGE_KEY]: next });
    // 지운 규칙의 발송 기록도 정리한다.
    if (removedId)
      chrome.storage.local.get(RULE_STATE_KEY, result => {
        const state = { ...(result?.[RULE_STATE_KEY] ?? {}) };
        delete state[removedId];
        chrome.storage.local.set({ [RULE_STATE_KEY]: state });
      });
  };
  return {
    rules,
    add: (rule: AlertRule) => save([...rules, rule]),
    remove: (id: string) =>
      save(
        rules.filter(rule => rule.id !== id),
        id,
      ),
  };
};

const RuleRow = ({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) => {
  const { t } = useI18n();
  return (
    <li className="flex min-h-7 items-center justify-between gap-1 px-1" data-testid="alert-rule">
      <span className="flex items-center gap-1 min-w-0 truncate">{children}</span>
      <IconButton aria-label={t('delete')} onClick={onRemove}>
        <X />
      </IconButton>
    </li>
  );
};

// 등록한 규칙 목록. 비어 있으면 안내 한 줄.
const RuleList = ({ empty, children }: { empty: boolean; children: React.ReactNode }) => {
  const { t } = useI18n();
  return (
    <ul className="divide-y divide-stroke-weak border-t pt-1">
      {empty ? <li className="px-1 py-2 text-fg-faint">{t('noRules')}</li> : children}
    </ul>
  );
};

const ChangeRules = () => {
  const { t } = useI18n();
  const { rules, add, remove } = useRules();
  const prices = useAllTickers(true);
  const [exchange, setExchange] = useState<ExchangePlatform>('upbit');
  const [market, setMarket] = useState('KRW-BTC');
  const [threshold, setThreshold] = useState('5');
  const [period, setPeriod] = useState<'24h' | `${SurgeWindow}`>('24h');
  const [direction, setDirection] = useState<Direction>('both');
  const normalized = market.trim().toUpperCase();
  const canAdd = !!prices[`${exchange}:${normalized}`] && Number(threshold) > 0;
  const changeRules = rules.filter((rule): rule is ChangeRule => rule.type === 'change');
  const surgeWindow = period === '24h' ? undefined : (Number(period) as SurgeWindow);

  return (
    <div className="flex flex-col gap-1.5">
      <MarketPicker
        exchange={exchange}
        onExchangeChange={setExchange}
        market={market}
        onMarketChange={setMarket}
        prices={prices}
      />
      <div className="flex items-center gap-1">
        <NativeSelect
          aria-label={t('changePeriod')}
          value={period}
          onChange={event => setPeriod(event.target.value as typeof period)}>
          <option value="24h">{t('period24h')}</option>
          {SURGE_WINDOWS.map(minutes => (
            <option key={minutes} value={minutes}>
              {t('periodMinutes').replace('{n}', String(minutes))}
            </option>
          ))}
        </NativeSelect>
        <DirectionSelect value={direction} onChange={setDirection} />
        <Input
          aria-label={t('changeThreshold')}
          inputMode="decimal"
          className="num h-control w-12 px-2 text-right text-cap-s"
          value={threshold}
          onChange={event => setThreshold(event.target.value)}
        />
        <span className="text-fg-subtle">%</span>
        <Button
          className="ml-auto h-control px-3 text-cap-s hover:cursor-pointer"
          disabled={!canAdd}
          onClick={() =>
            add({
              id: newId(),
              type: 'change',
              exchange,
              market: normalized,
              threshold: Number(threshold),
              ...(surgeWindow ? { window: surgeWindow } : {}),
              ...(direction !== 'both' ? { direction } : {}),
            })
          }>
          {t('addRule')}
        </Button>
      </div>
      <p className="text-cap-s text-fg-faint">{surgeWindow ? t('surgeRuleHelp') : t('changeRuleHelp')}</p>
      <RuleList empty={changeRules.length === 0}>
        {changeRules.map(rule => {
          const rate = prices[`${rule.exchange}:${rule.market}`]?.changeRate;
          return (
            <RuleRow key={rule.id} onRemove={() => remove(rule.id)}>
              <img src={EXCHANGES[rule.exchange]?.logo} className="size-3.5" />
              <span className="font-medium">{rule.market}</span>
              <span className="text-fg-subtle">
                {rule.window ? t('periodMinutes').replace('{n}', String(rule.window)) : t('period24h')}
              </span>
              <span className="num">
                {DIRECTION_SIGN[rule.direction ?? 'both']}
                {rule.threshold}%
              </span>
              {!rule.window && rate != null && (
                <span className={`num ${rate >= 0 ? 'text-up' : 'text-down'}`}>
                  ({t('currentValue')} {formatPercent(rate)})
                </span>
              )}
            </RuleRow>
          );
        })}
      </RuleList>
    </div>
  );
};

const KimchiRules = () => {
  const { t } = useI18n();
  const { rules, add, remove } = useRules();
  const [exchange, setExchange] = useState<'upbit' | 'bithumb'>('upbit');
  const [coin, setCoin] = useState('BTC');
  const [above, setAbove] = useState('5');
  const [below, setBelow] = useState('');
  const [premiums, setPremiums] = useState<KimchiItems>({});
  const visible = usePageVisible();

  useEffect(() => {
    if (!visible) return;
    let isUnmounted = false;
    const load = () =>
      chrome.runtime.sendMessage({ action: 'getKimchiPremium' }, (response?: { items?: KimchiItems }) => {
        if (!isUnmounted && !chrome.runtime.lastError && response?.items) setPremiums(response.items);
      });
    load();
    const intervalId = setInterval(load, 3000);
    return () => {
      isUnmounted = true;
      clearInterval(intervalId);
    };
  }, [visible]);

  const symbol = coin.trim().toUpperCase();
  const aboveValue = parseNumber(above);
  const belowValue = parseNumber(below);
  const canAdd =
    !!symbol &&
    (aboveValue != null || belowValue != null) &&
    ![aboveValue, belowValue].some(v => v != null && Number.isNaN(v));
  const kimchiRules = rules.filter((rule): rule is KimchiRule => rule.type === 'kimchi');
  const current = premiums[`${exchange}:KRW-${symbol}`]?.premium;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {(['upbit', 'bithumb'] as const).map(key => (
          <ExchangeChip
            key={key}
            logo={EXCHANGES[key].logo}
            label={t(EXCHANGES[key].labelKey)}
            selected={exchange === key}
            onClick={() => setExchange(key)}
          />
        ))}
        <Input
          aria-label={t('coinSymbol')}
          placeholder={t('coinSymbol')}
          className="h-control flex-1 px-2 text-cap-s"
          value={coin}
          onChange={event => setCoin(event.target.value)}
        />
        {current != null && <span className="num text-fg-subtle shrink-0">{formatPercent(current)}</span>}
      </div>
      <div className="flex items-center gap-1">
        {(
          [
            ['≥', 'kimchiAboveLabel', above, setAbove],
            ['≤', 'kimchiBelowLabel', below, setBelow],
          ] as const
        ).map(([sign, label, value, setValue]) => (
          // 값이 들어가도 어느 칸인지 보이게 앞에 기호를 둔다.
          <label key={label} className="relative flex-1">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle">{sign}</span>
            <Input
              aria-label={t(label)}
              placeholder={t(label)}
              inputMode="decimal"
              className="num h-control pl-5 pr-2 text-cap-s"
              value={value}
              onChange={event => setValue(event.target.value)}
            />
          </label>
        ))}
        <Button
          className="h-control px-3 text-cap-s hover:cursor-pointer"
          disabled={!canAdd}
          onClick={() =>
            add({ id: newId(), type: 'kimchi', exchange, coin: symbol, above: aboveValue, below: belowValue })
          }>
          {t('addRule')}
        </Button>
      </div>
      <p className="text-cap-s text-fg-faint">{t('kimchiRuleHelp')}</p>
      <RuleList empty={kimchiRules.length === 0}>
        {kimchiRules.map(rule => {
          const premium = premiums[`${rule.exchange}:KRW-${rule.coin}`]?.premium;
          return (
            <RuleRow key={rule.id} onRemove={() => remove(rule.id)}>
              <img src={EXCHANGES[rule.exchange].logo} className="size-3.5" />
              <span className="font-medium">{rule.coin}</span>
              {rule.above != null && <span>≥ {rule.above}%</span>}
              {rule.below != null && <span>≤ {rule.below}%</span>}
              {premium != null && (
                <span className="num text-fg-subtle">
                  ({t('currentValue')} {formatPercent(premium)})
                </span>
              )}
            </RuleRow>
          );
        })}
      </RuleList>
    </div>
  );
};

type WhaleTrade = { exchange: 'upbit' | 'binance'; market: string; price: number; amount: number; side: 'buy' | 'sell'; time: number };

const WHALE_EXCHANGES = ['upbit', 'binance'] as const;
const WHALE_DEFAULTS = { upbit: { market: 'KRW-BTC', amount: '100000000' }, binance: { market: 'BTCUSDT', amount: '500000' } };
const OI_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'] as const;

const compactAmount = (value: number, exchange: 'upbit' | 'binance', locale: string) =>
  new Intl.NumberFormat(exchange === 'upbit' ? locale : 'en-US', {
    style: 'currency',
    currency: exchange === 'upbit' ? 'KRW' : 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

// 대량 체결과 미결제약정(OI) 알림
const FlowRules = () => {
  const { t } = useI18n();
  const locale = t('numberLocale');
  const { rules, add, remove } = useRules();
  const prices = useAllTickers(true);
  const visible = usePageVisible();
  const [exchange, setExchange] = useState<'upbit' | 'binance'>('upbit');
  const [market, setMarket] = useState(WHALE_DEFAULTS.upbit.market);
  const [amount, setAmount] = useState(WHALE_DEFAULTS.upbit.amount);
  const [direction, setDirection] = useState<Direction>('both');
  const [oiSymbol, setOiSymbol] = useState<string>(OI_SYMBOLS[0]);
  const [oiThreshold, setOiThreshold] = useState('3');
  const [feed, setFeed] = useState<WhaleTrade[]>([]);

  const whaleRules = rules.filter((rule): rule is WhaleRule => rule.type === 'whale');
  const oiRules = rules.filter((rule): rule is OiRule => rule.type === 'oi');
  const normalized = market.trim().toUpperCase();
  const canAddWhale = !!prices[`${exchange}:${normalized}`] && Number(amount) > 0;

  useEffect(() => {
    if (!visible || !whaleRules.length) return;
    let isUnmounted = false;
    const load = () =>
      chrome.runtime.sendMessage({ action: 'getWhaleFeed' }, (response?: WhaleTrade[]) => {
        if (!isUnmounted && !chrome.runtime.lastError && Array.isArray(response)) setFeed(response);
      });
    load();
    const intervalId = setInterval(load, 2000);
    return () => {
      isUnmounted = true;
      clearInterval(intervalId);
    };
  }, [visible, whaleRules.length]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-semibold">{t('whaleAlerts')}</div>
      <div className="flex items-center gap-1">
        {WHALE_EXCHANGES.map(key => (
          <ExchangeChip
            key={key}
            logo={EXCHANGES[key].logo}
            label={t(EXCHANGES[key].labelKey)}
            selected={exchange === key}
            onClick={() => {
              setExchange(key);
              setMarket(WHALE_DEFAULTS[key].market);
              setAmount(WHALE_DEFAULTS[key].amount);
            }}
          />
        ))}
        <Input
          aria-label={t('marketCode')}
          placeholder={WHALE_DEFAULTS[exchange].market}
          className="h-control flex-1 px-2 text-cap-s"
          value={market}
          onChange={event => setMarket(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="relative flex-1">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle">
            ≥ {exchange === 'upbit' ? '₩' : '$'}
          </span>
          <Input
            aria-label={t('whaleMinAmount')}
            inputMode="numeric"
            className="num h-control pl-7 pr-2 text-cap-s"
            value={amount}
            onChange={event => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
          />
        </label>
        <DirectionSelect value={direction} onChange={setDirection} />
        <Button
          className="h-control px-3 text-cap-s hover:cursor-pointer"
          disabled={!canAddWhale}
          onClick={() =>
            add({
              id: newId(),
              type: 'whale',
              exchange,
              market: normalized,
              minAmount: Number(amount),
              ...(direction !== 'both' ? { direction } : {}),
            })
          }>
          {t('addRule')}
        </Button>
      </div>
      <p className="text-cap-s text-fg-faint">
        {Number(amount) > 0 && `${compactAmount(Number(amount), exchange, locale)} · `}
        {t('whaleRuleHelp')}
      </p>
      <RuleList empty={whaleRules.length === 0}>
        {whaleRules.map(rule => (
          <RuleRow key={rule.id} onRemove={() => remove(rule.id)}>
            <img src={EXCHANGES[rule.exchange].logo} className="size-3.5" />
            <span className="font-medium">{rule.market}</span>
            <span className="num">
              {DIRECTION_SIGN[rule.direction ?? 'both']} {compactAmount(rule.minAmount, rule.exchange, locale)}
            </span>
          </RuleRow>
        ))}
      </RuleList>
      {whaleRules.length > 0 && (
        <div data-testid="whale-feed">
          <div className="text-cap-s text-fg-subtle">{t('whaleFeed')}</div>
          {feed.slice(0, 5).map(trade => (
            <div key={`${trade.market}-${trade.time}-${trade.amount}`} className="flex justify-between gap-1 py-0.5 text-cap-s">
              <span className="truncate">
                {trade.market}{' '}
                <span className={trade.side === 'buy' ? 'text-up' : 'text-down'}>
                  {trade.side === 'buy' ? t('whaleBuy') : t('whaleSell')}
                </span>
              </span>
              <span className="num">
                {compactAmount(trade.amount, trade.exchange, locale)} ·{' '}
                {new Date(trade.time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
          {!feed.length && <div className="text-cap-s text-fg-faint">{t('whaleFeedEmpty')}</div>}
        </div>
      )}

      <div className="mt-1 border-t pt-1.5 font-semibold">{t('oiAlerts')}</div>
      <div className="flex items-center gap-1">
        <NativeSelect aria-label={t('oiSymbol')} value={oiSymbol} onChange={event => setOiSymbol(event.target.value)}>
          {OI_SYMBOLS.map(symbol => (
            <option key={symbol} value={symbol}>
              {symbol.replace(/USDT$/, '')}
            </option>
          ))}
        </NativeSelect>
        <span className="text-fg-muted">{t('oiThreshold')}</span>
        <Input
          aria-label={t('oiThreshold')}
          inputMode="decimal"
          className="num h-control w-12 px-2 text-right text-cap-s"
          value={oiThreshold}
          onChange={event => setOiThreshold(event.target.value)}
        />
        <span className="text-fg-subtle">%</span>
        <Button
          className="ml-auto h-control px-3 text-cap-s hover:cursor-pointer"
          disabled={!(Number(oiThreshold) > 0)}
          onClick={() => add({ id: newId(), type: 'oi', symbol: oiSymbol, threshold: Number(oiThreshold) })}>
          {t('addRule')}
        </Button>
      </div>
      <p className="text-cap-s text-fg-faint">{t('oiRuleHelp')}</p>
      <RuleList empty={oiRules.length === 0}>
        {oiRules.map(rule => (
          <RuleRow key={rule.id} onRemove={() => remove(rule.id)}>
            <span className="font-medium">{rule.symbol.replace(/USDT$/, '')} OI</span>
            <span className="num">±{rule.threshold}% / 1h</span>
          </RuleRow>
        ))}
      </RuleList>
    </div>
  );
};

export type RulesKind = 'change' | 'kimchi' | 'flow';

export const AlertRulesPanel = ({ kind }: { kind: RulesKind }) => (
  <div className="text-cap" data-testid={`alert-rules-${kind}`}>
    {kind === 'change' ? <ChangeRules /> : kind === 'kimchi' ? <KimchiRules /> : <FlowRules />}
  </div>
);
