import type { MutableRefObject } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft } from 'lucide-react';
import { DisplayCurrency, MessageKey, Translate } from '@/i18n';
import { convertFiat, FiatRates, formatFiat } from '@/lib/market';
import { AthMap, FavoriteCoins, KimchiPremium, KrwExchange, MarketType, UpbitTicker } from '@/types';
import { ChartCell, FavoriteStar, SortableHeader, TimeframeHeader } from './shared';
import { athColumn } from './athColumn';
import { toggleFavoriteCoin } from './favorites';
import { WarningIcon, CautionIcon } from '@/components/ui/warningIcon';
import { WalletStatusBadge } from '@/lib/walletStatus';
import { getChosungRegExp, getNumberFormat } from '@/lib/format';
import FlashCell from '@/components/FlashCell';

// 원화 거래소(업비트·빗썸·코인원·디지털엑스) 공통 컬럼. 백그라운드가 시세를 업비트와 같은 모양으로 맞춰 보낸다.
type KrwRow = UpbitTicker & {
  market_warning?: 'NONE' | 'CAUTION';
  market_event?: { warning: boolean; caution: boolean; cautionReasons?: string[] };
};

export const getKrwTradeUrl = (exchange: KrwExchange, market: string) => {
  const [quote, coin] = market.split('-');
  switch (exchange) {
    case 'upbit':
      return `https://upbit.com/exchange?code=CRIX.UPBIT.${market}`;
    case 'bithumb':
      return `https://www.bithumb.com/react/trade/order/${coin}-${quote}`;
    case 'coinone':
      return `https://coinone.co.kr/exchange/trade/${coin.toLowerCase()}/${quote.toLowerCase()}`;
    case 'digitalx':
      return `https://exchange.digitalx.miraeasset.com/trade/?symbol=${coin.toLowerCase()}_${quote.toLowerCase()}`;
  }
};

// 52주 최고·최저가는 업비트·빗썸 API만 준다.
const HAS_52_WEEK: readonly KrwExchange[] = ['upbit', 'bithumb'];

type Options = {
  exchange: KrwExchange;
  coinNameKR: boolean;
  setCoinNameKR: (value: boolean) => void;
  exchangeRateUSD: number;
  exchangeMarketType: MarketType;
  favoriteCoins: FavoriteCoins;
  setFavoriteCoins: React.Dispatch<React.SetStateAction<FavoriteCoins>>;
  favoriteFunc: boolean;
  wideSize: boolean;
  timeframe: string;
  setTimeframe: (value: string) => void;
  t: Translate;
  displayCurrency: DisplayCurrency;
  fiatRates: FiatRates;
  // 김프는 2초마다 바뀐다. 컬럼을 다시 만들지 않도록 ref로 최신 값을 읽는다.
  kimchiRef: MutableRefObject<KimchiPremium>;
  athRef: MutableRefObject<AthMap>;
};

export const getKrwColumns = ({
  exchange,
  coinNameKR,
  setCoinNameKR,
  exchangeRateUSD,
  exchangeMarketType,
  favoriteCoins,
  setFavoriteCoins,
  favoriteFunc,
  wideSize,
  timeframe,
  setTimeframe,
  t,
  displayCurrency,
  fiatRates,
  kimchiRef,
  athRef,
}: Options): ColumnDef<KrwRow>[] => {
  const columns: ColumnDef<KrwRow>[] = [
    {
      accessorFn: row => `${row.korean_name} ${row.market}`,
      id: 'market',
      header: () => (
        <button
          type="button"
          className="flex font-bold hover:cursor-pointer"
          aria-label={t('toggleCoinName')}
          onClick={() => setCoinNameKR(!coinNameKR)}>
          <span className="mr-[2px]">{coinNameKR ? t('nameKR') : t('nameEN')}</span>
          <ArrowRightLeft size={10} strokeWidth={3} className="mt-[2px]" aria-hidden />
        </button>
      ),
      cell: ({ row }) => {
        const market = row.original.market;
        const [quote, coin] = market.split('-');
        const toggleFavorite = () => toggleFavoriteCoin({ row, exchange, market, favoriteCoins, setFavoriteCoins });
        const name = coinNameKR ? row.original.korean_name : row.original.english_name;

        return (
          <div className="flex min-w-0 gap-[2px] font-semibold">
            {favoriteFunc && (
              <FavoriteStar pinned={row.getIsPinned() !== false} onToggle={toggleFavorite} label={t('favoritePin')} />
            )}
            <div className="min-w-0 text-left">
              <div className="flex min-w-0 gap-[2px]">
                <a href={getKrwTradeUrl(exchange, market)} target="_blank" title={name} className="truncate hover:text-fg-faint">
                  {name}
                </a>
                <div className="flex shrink-0 gap-[1px] items-center">
                  {row.original.market_event?.warning && <WarningIcon text={t('warningShort')} title={t('caution_WARNING')} />}
                  {row.original.market_event?.caution && (
                    <CautionIcon
                      text={t('cautionShort')}
                      title={(row.original.market_event.cautionReasons ?? [])
                        .map(reason => t(`caution_${reason}` as MessageKey) ?? reason)
                        .join(' · ')}
                    />
                  )}
                  {row.original.market_warning && row.original.market_warning !== 'NONE' && (
                    <WarningIcon text={t('warningShort')} />
                  )}
                  {exchange === 'bithumb' && <WalletStatusBadge exchange="bithumb" coin={coin} />}
                </div>
              </div>
              <span className="block truncate text-cap text-fg-subtle font-medium">{`${coin}/${quote}`}</span>
            </div>
          </div>
        );
      },
      filterFn: (row, _columnId, filterValue) => {
        if (!filterValue) return true;
        const market = row.original.market.toLowerCase();
        const englishName = row.original.english_name?.toLowerCase() || '';
        const koreanName = row.original.korean_name || '';
        const searchValue = filterValue.toLowerCase().trim();
        const fullTextMatch =
          market.includes(searchValue) || englishName.includes(searchValue) || koreanName.includes(searchValue);
        return fullTextMatch || getChosungRegExp(searchValue).test(koreanName);
      },
      enableHiding: false,
      size: 103,
    },
    {
      accessorKey: 'candlestick_chart',
      header: () => <TimeframeHeader timeframe={timeframe} setTimeframe={setTimeframe} t={t} />,
      cell: ({ row }) => (
        <ChartCell
          symbol={row.original.market}
          exchange={exchange}
          timeframe={timeframe}
          wideSize={wideSize}
          pinned={row.getIsPinned() !== false}
        />
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'trade_price',
      header: ({ column }) => <SortableHeader column={column} label={t('currentPrice')} />,
      cell: ({ getValue, row, cell }) => {
        const valueKRW = getValue() as number;
        // 원화 마켓 보조 가격: 표시 통화가 KRW면 달러로, 아니면 표시 통화로 보여준다.
        const secondaryCurrency = displayCurrency === 'KRW' ? 'USD' : displayCurrency;
        const secondaryValue = convertFiat(valueKRW, 'KRW', secondaryCurrency, { exchangeRateUSD, fiatRates });

        return (
          <FlashCell
            key={cell.id}
            flashKey={cell.id}
            bidAskStatus={row.original.ask_bid ? row.original.ask_bid : ''}
            className={'flex flex-col items-end font-medium whitespace-nowrap'}>
            {exchangeMarketType === 'KRW' && (
              <>
                <span>{valueKRW?.toLocaleString()}</span>
                <span className="text-cap-s text-fg-subtle">
                  {secondaryValue !== null && formatFiat(secondaryValue, secondaryCurrency, t('numberLocale'))}
                </span>
              </>
            )}
            {exchangeMarketType === 'BTC' && <span>{valueKRW.toFixed(8)}</span>}
            {exchangeMarketType === 'USDT' && (
              <span>${valueKRW.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            )}
          </FlashCell>
        );
      },
      enableHiding: false,
    },
    {
      // 정렬이 숫자 기준이 되도록 숫자로 둔다(문자열이면 음수끼리 순서가 뒤집힌다).
      accessorFn: row => row.signed_change_rate * 100,
      id: 'signed_change_rate',
      header: ({ column }) => <SortableHeader column={column} label={t('change')} />,
      cell: ({ row, getValue }) => {
        const value = (getValue() as number).toFixed(2);
        const signedChangePrice = row.original.signed_change_price?.toLocaleString();
        return (
          <div className="flex flex-col items-end font-medium whitespace-nowrap">
            <span
              className={`${row.original.change === 'RISE' ? 'text-up' : row.original.change === 'FALL' ? 'text-down' : ''}`}>
              {`${row.original.change === 'RISE' ? '+' : ''}${value}%`}
            </span>
            {exchangeMarketType !== 'BTC' && <span className="text-cap-s text-fg-subtle">{signedChangePrice}</span>}
          </div>
        );
      },
      enableHiding: false,
    },
  ];

  if (exchangeMarketType === 'KRW') {
    columns.push({
      // 김프: 이 거래소 원화 가격이 바이낸스 USDT 가격(원화 환산)보다 몇 % 비싼지. 바이낸스에 없으면 비워 두고 정렬 때 맨 뒤로 보낸다.
      accessorFn: row => kimchiRef.current.items[`${exchange}:${row.market}`]?.premium,
      id: 'kimchi_premium',
      sortUndefined: 'last',
      header: ({ column }) => <SortableHeader column={column} label={t('kimchiShort')} />,
      cell: ({ row }) => {
        const item = kimchiRef.current.items[`${exchange}:${row.original.market}`];
        if (!item) return <div className="flex justify-end text-fg-faint">-</div>;
        const rate = kimchiRef.current.rate;
        return (
          <div className="flex flex-col items-end font-medium whitespace-nowrap" title={t('kimchiColumnHint')}>
            <span className={item.premium >= 0 ? 'text-up' : 'text-down'}>
              {item.premium >= 0 ? '+' : ''}
              {item.premium.toFixed(2)}%
            </span>
            {rate && (
              <span className="text-cap-s text-fg-subtle">{Math.round(item.usdtPrice * rate).toLocaleString()}</span>
            )}
          </div>
        );
      },
    });
  }

  if (HAS_52_WEEK.includes(exchange)) {
    columns.push(
      {
        accessorFn: row => ((row.highest_52_week_price - row.trade_price) / row.highest_52_week_price) * 100,
        id: 'highest_52_week_diff',
        header: ({ column }) => <SortableHeader column={column} label={t('fromHigh52w')} />,
        cell: ({ getValue, row }) => {
          const value = (getValue() as number).toFixed(2);
          const highest = row.original.highest_52_week_price;
          return (
            <div className="flex flex-col items-end text-down font-medium">
              <span>-{value}%</span>
              <span className="text-cap-s text-fg-subtle">
                {exchangeMarketType !== 'BTC' ? highest?.toLocaleString() : highest?.toFixed(8)}
              </span>
            </div>
          );
        },
      },
      {
        accessorFn: row => ((row.trade_price - row.lowest_52_week_price) / row.lowest_52_week_price) * 100,
        id: 'lowest_52_week_diff',
        header: ({ column }) => <SortableHeader column={column} label={t('fromLow52w')} />,
        cell: ({ getValue, row }) => {
          const value = (getValue() as number).toFixed(2);
          const lowest = row.original.lowest_52_week_price;
          return (
            <div className="flex flex-col items-end text-up font-medium">
              <span>+{value}%</span>
              <span className="text-cap-s text-fg-subtle">
                {exchangeMarketType !== 'BTC' ? lowest?.toLocaleString() : lowest?.toFixed(8)}
              </span>
            </div>
          );
        },
      },
    );
  }

  if (exchangeMarketType !== 'BTC') columns.push(athColumn<KrwRow>(row => row.market.split('-')[1], athRef, t));

  columns.push({
    accessorKey: 'acc_trade_price_24h',
    id: 'acc_trade_price_24h',
    header: ({ column }) => <SortableHeader column={column} label={t('volume')} />,
    cell: ({ getValue }) => {
      const value = Number(getValue() as number);
      const text =
        exchangeMarketType === 'BTC'
          ? value >= 1
            ? value.toFixed(2)
            : value.toFixed(5)
          : getNumberFormat(exchangeMarketType === 'USDT' ? 'en-US' : t('numberLocale'), {
              style: 'currency',
              currency: exchangeMarketType === 'USDT' ? 'USD' : 'KRW',
              notation: 'compact', // ko: 만·억·조, en: K·M·B 단위 적용
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(value);
      return (
        <div className="flex justify-end font-medium p-2 whitespace-nowrap">
          <span>{text}</span>
        </div>
      );
    },
  });

  return columns;
};
