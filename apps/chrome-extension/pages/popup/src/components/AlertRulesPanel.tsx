import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MarketPicker } from '@/components/MarketPicker';
import { useAllTickers } from '@/hooks/useAllTickers';
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

const RuleRow = ({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) => (
  <li className="flex items-center justify-between gap-1 py-0.5" data-testid="alert-rule">
    <span className="flex items-center gap-1 min-w-0 truncate">{children}</span>
    <Button
      variant="ghost"
      size="icon"
      className="h-4 w-4 p-0 hover:bg-transparent hover:cursor-pointer"
      onClick={onRemove}>
      <X className="h-3 w-3" />
    </Button>
  </li>
);

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
        <label className="flex-1 text-fg-subtle">{t('changeThreshold')}</label>
        <Input
          aria-label={t('changeThreshold')}
          inputMode="decimal"
          className="h-6 w-14 px-1 text-cap-s"
          value={threshold}
          onChange={event => setThreshold(event.target.value)}
        />
        <Button
          className="h-6 px-2 text-cap-s hover:cursor-pointer"
          disabled={!canAdd}
          onClick={() =>
            add({ id: newId(), type: 'change', exchange, market: normalized, threshold: Number(threshold) })
          }>
          {t('addRule')}
        </Button>
      </div>
      <p className="text-cap-s text-fg-faint">{t('changeRuleHelp')}</p>
      <ul className="border-t pt-1">
        {changeRules.length === 0 && <li className="text-fg-faint py-1">{t('noRules')}</li>}
        {changeRules.map(rule => {
          const rate = prices[`${rule.exchange}:${rule.market}`]?.changeRate;
          return (
            <RuleRow key={rule.id} onRemove={() => remove(rule.id)}>
              <img src={EXCHANGES[rule.exchange]?.logo} className="size-3" />
              <span className="font-medium">{rule.market}</span>
              <span>±{rule.threshold}%</span>
              {rate != null && (
                <span className={`num ${rate >= 0 ? 'text-up' : 'text-down'}`}>
                  ({t('currentValue')} {formatPercent(rate)})
                </span>
              )}
            </RuleRow>
          );
        })}
      </ul>
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

  useEffect(() => {
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
  }, []);

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
          <button
            key={key}
            type="button"
            aria-pressed={exchange === key}
            className={`p-0.5 rounded hover:cursor-pointer ${exchange === key ? 'ring-1 ring-stroke-strong' : 'opacity-60'}`}
            onClick={() => setExchange(key)}>
            <img src={EXCHANGES[key].logo} className="size-4" />
          </button>
        ))}
        <Input
          aria-label={t('coinSymbol')}
          placeholder={t('coinSymbol')}
          className="h-6 flex-1 px-1 text-cap-s"
          value={coin}
          onChange={event => setCoin(event.target.value)}
        />
        {current != null && <span className="num text-fg-subtle shrink-0">{formatPercent(current)}</span>}
      </div>
      <div className="flex items-center gap-1">
        <Input
          aria-label={t('kimchiAboveLabel')}
          placeholder={t('kimchiAboveLabel')}
          inputMode="decimal"
          className="h-6 flex-1 px-1 text-cap-s"
          value={above}
          onChange={event => setAbove(event.target.value)}
        />
        <Input
          aria-label={t('kimchiBelowLabel')}
          placeholder={t('kimchiBelowLabel')}
          inputMode="decimal"
          className="h-6 flex-1 px-1 text-cap-s"
          value={below}
          onChange={event => setBelow(event.target.value)}
        />
        <Button
          className="h-6 px-2 text-cap-s hover:cursor-pointer"
          disabled={!canAdd}
          onClick={() =>
            add({ id: newId(), type: 'kimchi', exchange, coin: symbol, above: aboveValue, below: belowValue })
          }>
          {t('addRule')}
        </Button>
      </div>
      <p className="text-cap-s text-fg-faint">{t('kimchiRuleHelp')}</p>
      <ul className="border-t pt-1">
        {kimchiRules.length === 0 && <li className="text-fg-faint py-1">{t('noRules')}</li>}
        {kimchiRules.map(rule => {
          const premium = premiums[`${rule.exchange}:KRW-${rule.coin}`]?.premium;
          return (
            <RuleRow key={rule.id} onRemove={() => remove(rule.id)}>
              <img src={EXCHANGES[rule.exchange].logo} className="size-3" />
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
      </ul>
    </div>
  );
};

export const AlertRulesPanel = ({ kind }: { kind: 'change' | 'kimchi' }) => (
  <div className="text-cap" data-testid={`alert-rules-${kind}`}>
    {kind === 'change' ? <ChangeRules /> : <KimchiRules />}
  </div>
);
