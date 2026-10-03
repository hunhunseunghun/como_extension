import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, Bell, X, HelpCircle } from 'lucide-react';
import { getRegExp } from 'korean-regexp';
import { useI18n } from '@/i18n';
import { EXCHANGES } from '@/constants/exchanges';
import { AlertRulesPanel } from '@/components/AlertRulesPanel';
import { HoverHint } from '@/components/ui/hoverHint';
import { IconButton } from '@/components/ui/iconButton';
import { Segmented } from '@/components/ui/segmented';

type AlertTab = 'price' | 'change' | 'kimchi';

type ExchangeTicker = {
  exchange: string;
  market: string;
  currentPrice: number;
  changeRate: number;
  koreanName?: string;
};
type AllExchangesTickers = ExchangeTicker[];

type ExchangeData = (typeof EXCHANGES)[keyof typeof EXCHANGES];

type PriceDeadbandPair = { price: number; deadband: number };

const searchTicker = (ticker: ExchangeTicker, searchValue: string): boolean => {
  const trimmedSearch = searchValue.trim();
  const market = ticker.market.toLowerCase();
  const koreanName = ticker.koreanName || '';

  if (!trimmedSearch) return true;
  if (market.includes(trimmedSearch.toLowerCase())) return true;

  if (koreanName) {
    if (koreanName.includes(trimmedSearch)) return true;
    try {
      const chosungRegex = getRegExp(trimmedSearch, { initialSearch: true });
      if (chosungRegex.test(koreanName)) return true;
    } catch (error) {
      console.warn(error);
      return koreanName.includes(trimmedSearch);
    }
  }
  return false;
};

const exchangesData = EXCHANGES;

export const PriceNotiPopover = () => {
  const { language, t } = useI18n();
  const [selectedTicker, setSelectedTicker] = useState<ExchangeTicker | null>(null);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [allExchangesTickers, setAllExchangesTickers] = useState<AllExchangesTickers>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [exchangePlatform, setExchangePlatform] = useState<ExchangeData>(exchangesData.upbit);
  const [targetPrice, setTargetPrice] = useState<number>(0);
  const [deadBand, setDeadBand] = useState<number>(5);
  const [allPriceAlerts, setAllPriceAlerts] = useState<{
    [exchange: string]: { [ticker: string]: PriceDeadbandPair[] };
  }>({});
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [tab, setTab] = useState<AlertTab>('price');

  // 전체 티커는 메시지 응답으로 받는다. 별도 'popup' 포트를 열면 App의 포트를 백그라운드에서 덮어쓴다.
  useEffect(() => {
    let isUnmounted = false;
    setIsLoading(true);

    chrome.runtime.sendMessage({ action: 'getAllExchangesTickers' }, (tickers?: ExchangeTicker[]) => {
      if (isUnmounted) return;
      setIsLoading(false);
      if (chrome.runtime.lastError || !Array.isArray(tickers)) return;

      const uniqueTickers = Array.from(
        new Map(
          tickers.map(ticker => [`${ticker.exchange.toLowerCase()}:${ticker.market.toLowerCase()}`, ticker]),
        ).values(),
      );
      setAllExchangesTickers(uniqueTickers);

      const defaultTicker = uniqueTickers.find(ticker => ticker.exchange === 'upbit' && ticker.market === 'KRW-BTC');
      if (defaultTicker) {
        setSelectedTicker(defaultTicker);
        setTargetPrice(defaultTicker.currentPrice || 0);
      }
    });
    chrome.storage.local.get(['priceAlerts'], result => {
      if (!isUnmounted) setAllPriceAlerts(result.priceAlerts || {});
    });

    return () => {
      isUnmounted = true;
    };
  }, []);

  const filteredTickers = useMemo(() => {
    if (isLoading || allExchangesTickers.length === 0) return [];
    const platformFilteredTickers = allExchangesTickers.filter(
      ticker => ticker.exchange.toLowerCase() === exchangePlatform.key.toLowerCase(),
    );
    if (!searchValue.trim()) return platformFilteredTickers;
    return platformFilteredTickers.filter(ticker => searchTicker(ticker, searchValue));
  }, [allExchangesTickers, searchValue, isLoading, exchangePlatform]);

  const renderTickerItem = useCallback(
    (ticker: ExchangeTicker) => {
      const handleSelect = (value: string) => {
        const foundTicker = allExchangesTickers.find(
          t => `${t.exchange.toLowerCase()}:${t.market.toLowerCase()}` === value.toLowerCase(),
        );
        if (foundTicker && foundTicker.currentPrice) {
          setSelectedTicker(foundTicker);
          setTargetPrice(foundTicker.currentPrice);
          setIsCommandOpen(false);
          setSearchValue('');
        }
      };

      const uniqueValue = `${ticker.exchange}:${ticker.market}`;
      return (
        <CommandItem
          className="text-cap-s hover:bg-muted"
          key={uniqueValue}
          value={uniqueValue}
          onMouseDown={e => {
            e.preventDefault();
            handleSelect(uniqueValue);
          }}>
          {ticker.koreanName ? (
            <div className="flex items-center gap-1">
              <img
                src={exchangesData[ticker.exchange as keyof typeof exchangesData]?.logo}
                alt={`${ticker.exchange} logo`}
                className="size-3.5"
              />
              {`${ticker.koreanName} (${ticker.market})`}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <img
                src={exchangesData[ticker.exchange as keyof typeof exchangesData]?.logo}
                alt={`${ticker.exchange} logo`}
                className="size-3.5"
              />
              {ticker.market}
            </div>
          )}
        </CommandItem>
      );
    },
    [allExchangesTickers],
  );

  const handleSetPriceAlert = () => {
    if (!selectedTicker || targetPrice <= 0) {
      setErrorMessage(t('alertInvalid'));
      return;
    }

    const currentPairs = allPriceAlerts[selectedTicker.exchange]?.[selectedTicker.market] || [];
    if (currentPairs.some(pair => pair.price === targetPrice)) {
      return;
    }

    const newPair = { price: targetPrice, deadband: deadBand / 100 };

    // 낙관적 업데이트: UI를 먼저 업데이트하여 사용자 경험 개선
    const updatedAlerts = { ...allPriceAlerts };
    if (!updatedAlerts[selectedTicker.exchange]) updatedAlerts[selectedTicker.exchange] = {};
    if (!updatedAlerts[selectedTicker.exchange][selectedTicker.market]) {
      updatedAlerts[selectedTicker.exchange][selectedTicker.market] = [];
    }
    updatedAlerts[selectedTicker.exchange][selectedTicker.market].push(newPair);
    setAllPriceAlerts(updatedAlerts);

    chrome.runtime.sendMessage(
      {
        action: 'setPriceAlert',
        exchange: selectedTicker.exchange,
        ticker: selectedTicker.market,
        prices: [newPair],
      },
      response => {
        if (response?.success) {
          // 저장이 완료된 후 로컬 스토리지에서 최신 데이터를 가져와 UI 동기화
          chrome.storage.local.get(['priceAlerts'], result => {
            setAllPriceAlerts(result.priceAlerts || {});
          });
        } else {
          const rollbackAlerts = { ...updatedAlerts };
          rollbackAlerts[selectedTicker.exchange][selectedTicker.market] = rollbackAlerts[selectedTicker.exchange][
            selectedTicker.market
          ].filter(p => p.price !== targetPrice);
          setAllPriceAlerts(rollbackAlerts);
        }
      },
    );
  };

  const handleDeletePriceAlert = (exchange: string, ticker: string, priceToDelete: number) => {
    const previousAlerts = { ...allPriceAlerts }; // 롤백용 이전 상태 저장

    // 낙관적 업데이트
    const updatedAlerts = { ...allPriceAlerts };
    if (updatedAlerts[exchange]?.[ticker]) {
      updatedAlerts[exchange][ticker] = updatedAlerts[exchange][ticker].filter(pair => pair.price !== priceToDelete);
      if (updatedAlerts[exchange][ticker].length === 0) delete updatedAlerts[exchange][ticker];
      if (Object.keys(updatedAlerts[exchange]).length === 0) delete updatedAlerts[exchange];
      setAllPriceAlerts(updatedAlerts); // UI 즉시 업데이트
    }

    chrome.runtime.sendMessage(
      {
        action: 'deletePriceAlert',
        exchange,
        ticker,
        price: priceToDelete,
      },
      response => {
        if (response?.success) {
          // 백엔드에서 최신 데이터로 동기화
          chrome.storage.local.get(['priceAlerts'], result => {
            setAllPriceAlerts(result.priceAlerts || {});
          });
        } else {
          // 실패 시 롤백
          setAllPriceAlerts(previousAlerts);
        }
      },
    );
  };

  return (
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <div className="relative group">
            <Button variant="outline" size="icon" className="relative w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
              <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
            </Button>
            <HoverHint>
              {t('alertTitle')}
            </HoverHint>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2 text-cap bg-background border border-stroke-weak">
          <Segmented
            variant="tabs"
            fill
            className="mb-2"
            value={tab}
            onChange={setTab}
            options={(
              [
                ['price', 'alertTabPrice'],
                ['change', 'alertTabChange'],
                ['kimchi', 'alertTabKimchi'],
              ] as const
            ).map(([value, label]) => ({ value, label: t(label) }))}
          />
          {tab !== 'price' ? (
            <AlertRulesPanel kind={tab} />
          ) : (
            <>
              <div>
                <Command shouldFilter={false} className="w-full bg-background">
                  <div className="relative">
                    <section className="flex h-control w-full items-center gap-1 rounded-md border border-field-border bg-field">
                      <CommandInput
                        className="w-full h-6 p-0 gap-1 text-cap border-none text-fg-neutral pl-4 focus-visible:ring-0"
                        placeholder={t('searchPlaceholder')}
                        value={searchValue}
                        onValueChange={value => {
                          setSearchValue(value);
                          setIsCommandOpen(true);
                        }}
                        onClick={() => setIsCommandOpen(!isCommandOpen)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-6 w-10 text-cap font-semibold gap-1 border-transparent bg-transparent shadow-none hover:cursor-pointer">
                            <img src={exchangePlatform.logo} className="size-3" />
                            <ChevronDown className="size-2.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="relative left-0 p-1 data-[side=bottom]:slide-in-from-top-2">
                          <DropdownMenuGroup>
                            {Object.values(exchangesData).map(({ key, logo }) => (
                              <DropdownMenuItem
                                key={key}
                                className="w-7.5 px-1 py-1 justify-center items-center text-body-s hover:cursor-pointer"
                                onClick={() => setExchangePlatform(exchangesData[key as keyof typeof exchangesData])}>
                                <img src={logo} className="size-3.5" />
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </section>
                    {isCommandOpen && (
                      <CommandList className="absolute top-[calc(var(--como-control-h)+4px)] left-0 w-full max-h-70 overflow-y-auto rounded-md border bg-layer-floating shadow-md z-50 light-scrollbar dark-scrollbar text-cap-s">
                        {isLoading ? (
                          <CommandEmpty>Loading...</CommandEmpty>
                        ) : filteredTickers.length === 0 ? (
                          <CommandEmpty>No results</CommandEmpty>
                        ) : (
                          <CommandGroup className="text-cap-s font-semibold">
                            {filteredTickers.map(ticker => renderTickerItem(ticker))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    )}
                  </div>
                  <section className="flex flex-col pt-2 gap-1.5">
                    <div className="flex items-center h-7 text-title-s gap-1 px-1">
                      {selectedTicker?.market && (
                        <div className="flex items-center font-semibold gap-1">
                          <img
                            src={exchangesData[selectedTicker.exchange as keyof typeof exchangesData]?.logo}
                            alt={`${selectedTicker.exchange} logo`}
                            className="size-3.5"
                          />
                          {language === 'ko' && selectedTicker.koreanName
                            ? `${selectedTicker.koreanName} (${selectedTicker.market})`
                            : selectedTicker.market}
                        </div>
                      )}
                    </div>

                    <div className="relative flex h-control items-center rounded-md border border-field-border bg-field text-body-s">
                      <Label className="absolute left-2 top-1/2 -translate-y-1/2 text-cap-s text-fg-muted">{t('targetPrice')}</Label>
                      <Input
                        type="text"
                        value={targetPrice.toLocaleString('en-US')}
                        onChange={e => {
                          const value = e.target.value.replace(/,/g, '');
                          setTargetPrice(Number(value) || 0);
                        }}
                        className="num w-full h-full text-right font-semibold focus:outline-none appearance-none border-none bg-transparent shadow-none hover:bg-transparent"
                      />
                    </div>

                    <div className="relative flex h-control items-center rounded-md border border-field-border bg-field text-body-s">
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <Label className="text-cap-s text-fg-muted">{t('deadband')}</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="size-3 text-fg-subtle hover:text-fg-muted" />
                            </TooltipTrigger>
                            <TooltipContent className="w-[180px]">
                              <div>{t('deadbandHelp1')}</div>
                              <div>{t('deadbandHelp2')}</div>
                              <div>{t('deadbandHelp3')}</div>
                              <div>{t('deadbandHelp4')}</div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-center w-full">
                        <Input
                          type="number"
                          value={deadBand}
                          onChange={e => {
                            const value = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                            setDeadBand(value);
                          }}
                          className="num w-full h-full text-right pr-5 font-semibold focus:outline-none border-none bg-transparent shadow-none hover:bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={0}
                          max={100}
                          step={1}
                        />
                        <span className="absolute right-7 text-cap text-fg-subtle">%</span>
                        <div className="flex flex-col h-6">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-3 w-6 p-0 hover:bg-transparent"
                            onClick={() => setDeadBand(prev => Math.min(100, prev + 1))}>
                            <ChevronDown className="h-2.5 w-2.5 rotate-180" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-3 w-6 p-0 hover:bg-transparent"
                            onClick={() => setDeadBand(prev => Math.max(0, prev - 1))}>
                            <ChevronDown className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {errorMessage && <div className="text-cap-s text-fg-critical mt-1">{errorMessage}</div>}

                    <Button onClick={handleSetPriceAlert} className="mt-1 h-control-lg text-cap hover:cursor-pointer">
                      {t('addAlert')}
                    </Button>
                  </section>
                </Command>
              </div>
              <section>
                <h3 className="mt-3 border-t px-1 pt-2 text-cap-s font-semibold text-fg-subtle">{t('allAlerts')}</h3>
                <div className="h-[200px] overflow-y-auto light-scrollbar dark-scrollbar">
                  {Object.keys(allPriceAlerts).length > 0 ? (
                    <Accordion type="single" collapsible className="w-full text-cap mt-1">
                      {Object.entries(allPriceAlerts).map(([exchange, tickers]) =>
                        tickers && typeof tickers === 'object'
                          ? Object.entries(tickers).map(([ticker, pairs]) =>
                              Array.isArray(pairs) && pairs.length > 0 ? (
                                <AccordionItem
                                  key={`${exchange}-${ticker}`}
                                  value={`${exchange}-${ticker}`}
                                  className="border-none">
                                  <AccordionTrigger className="text-cap px-1 py-1.5 hover:no-underline">
                                    <div className="flex items-center gap-1">
                                      <img
                                        src={exchangesData[exchange as keyof typeof exchangesData]?.logo}
                                        alt={`${exchange} logo`}
                                        className="size-3"
                                      />
                                      <span>{ticker}</span>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="text-cap">
                                    <ul className="ml-4">
                                      {pairs.map((pair, index) =>
                                        pair && typeof pair === 'object' && pair.price !== undefined ? (
                                          <li key={index} className="flex min-h-6 items-center justify-between">
                                            <span className="num">
                                              {pair.price.toLocaleString('en-US')} ({t('deadband')}:{' '}
                                              {(pair.deadband * 100).toFixed(2)}%)
                                            </span>
                                            <IconButton
                                              aria-label={t('delete')}
                                              onClick={() => handleDeletePriceAlert(exchange, ticker, pair.price)}>
                                              <X />
                                            </IconButton>
                                          </li>
                                        ) : null,
                                      )}
                                    </ul>
                                  </AccordionContent>
                                </AccordionItem>
                              ) : null,
                            )
                          : null,
                      )}
                    </Accordion>
                  ) : (
                    <div className="px-1 py-2 text-cap text-fg-faint">{t('noAlerts')}</div>
                  )}
                </div>
              </section>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
