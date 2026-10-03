import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExchangeChip } from '@/components/ui/exchangeChip';
import { IconButton } from '@/components/ui/iconButton';
import { MarketPicker } from '@/components/MarketPicker';
import { useAllTickers } from '@/hooks/useAllTickers';
import { usePageVisible } from '@/hooks/usePageVisible';
import { EXCHANGES } from '@/constants/exchanges';
import { useI18n } from '@/i18n';
import type { ExchangePlatform } from '@/types';

// 백그라운드(checkAlertRules)와 같은 형식이다.
export type ChangeRule = { id: string; type: 'change'; exchange: ExchangePlatform; market: string; threshold: number };
export type KimchiRule = {
  id: string;
  type: 'kimchi';
  exchange: 'upbit' | 'bithumb';
  coin: string;
  above?: number;
  below?: number;
};
export type AlertRule = ChangeRule | KimchiRule;

export const RULES_STORAGE_KEY = 'alertRules';
const RULE_STATE_KEY = 'alertRuleState';

type KimchiItems = Record<string, { premium: number }>;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
  const normalized = market.trim().toUpperCase();
  const canAdd = !!prices[`${exchange}:${normalized}`] && Number(threshold) > 0;
  const changeRules = rules.filter((rule): rule is ChangeRule => rule.type === 'change');

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
        <label className="flex-1 text-fg-muted">{t('changeThreshold')}</label>
        <Input
          aria-label={t('changeThreshold')}
          inputMode="decimal"
          className="num h-control w-14 px-2 text-right text-cap-s"
          value={threshold}
          onChange={event => setThreshold(event.target.value)}
        />
        <Button
          className="h-control px-3 text-cap-s hover:cursor-pointer"
          disabled={!canAdd}
          onClick={() =>
            add({ id: newId(), type: 'change', exchange, market: normalized, threshold: Number(threshold) })
          }>
          {t('addRule')}
        </Button>
      </div>
      <p className="text-cap-s text-fg-faint">{t('changeRuleHelp')}</p>
      <RuleList empty={changeRules.length === 0}>
        {changeRules.map(rule => {
          const rate = prices[`${rule.exchange}:${rule.market}`]?.changeRate;
          return (
            <RuleRow key={rule.id} onRemove={() => remove(rule.id)}>
              <img src={EXCHANGES[rule.exchange]?.logo} className="size-3.5" />
              <span className="font-medium">{rule.market}</span>
              <span className="num">±{rule.threshold}%</span>
              {rate != null && (
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

export const AlertRulesPanel = ({ kind }: { kind: 'change' | 'kimchi' }) => (
  <div className="text-cap" data-testid={`alert-rules-${kind}`}>
    {kind === 'change' ? <ChangeRules /> : <KimchiRules />}
  </div>
);
