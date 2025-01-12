import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Bell } from 'lucide-react';

type exchangeTicker = { exchange: string; market: string; changeRate: number; lastPrice: number };
type AllExchangesTickers = exchangeTicker[];

export const PriceNotiPopover = () => {
  const [selectedTicker, setSelectTicker] = useState<exchangeTicker | null>(null); // Status 대신 exchangeTicker 사용
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [allExchangesTickers, setAllExchangesTickers] = useState<AllExchangesTickers>([]);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'popup' });

    port.onMessage.addListener(({ type, data }) => {
      switch (type) {
        case 'allExchangesTickers':
          console.log('allExchangesTickers in priceNotiPopover', data);
          setAllExchangesTickers(data); // data로 업데이트 (빈 배열 대신)
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      setTimeout(() => chrome.runtime.connect({ name: 'popup' }), 500);
    });

    chrome.runtime.sendMessage({ action: 'getAllExchangesTickers' });

    return () => port.disconnect();
  }, []);

  return (
    <div className="relative inline-flex group">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-1">
          <div className="grid gap-4">
            <Command>
              <div>{selectedTicker ? selectedTicker.market : 'Coin'}</div>
              <CommandInput
                placeholder="Search coin"
                onFocus={() => setIsCommandOpen(true)}
                onBlur={() => setIsCommandOpen(false)}
              />
              {isCommandOpen && (
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  <CommandGroup>
                    {allExchangesTickers.map(ticker => (
                      <CommandItem
                        key={ticker.market}
                        value={ticker.market}
                        onSelect={value => {
                          setSelectTicker(allExchangesTickers.find(ticker => ticker.market.includes(value)) || null);
                          setIsCommandOpen(false);
                        }}>
                        {ticker.market} {/* ticker 객체의 market 사용 */}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              )}
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Dimensions</h4>
                <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="width">Width</Label>
                  <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="maxWidth">Max. width</Label>
                  <Input id="maxWidth" defaultValue="300px" className="col-span-2 h-8" />
                </div>
              </div>
            </Command>
          </div>
        </PopoverContent>
      </Popover>
      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white font-semibold bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-49">
        지정가 알림 설정
      </span>
    </div>
  );
};
