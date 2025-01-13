import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Bell } from 'lucide-react';

type Status = {
  value: string;
  label: string;
};

export const PriceNotiPopover = () => {
  const [selectedStatus, setSelectedStatus] = useState<Status | null>(null);
  const [isCommandOpen, setIsCommandOpen] = useState(false); // CommandList 열림/닫힘 상태

  const statuses: Status[] = [
    { value: 'backlog', label: 'Backlog' },
    { value: 'todo', label: 'Todo' },
    { value: 'in progress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
    { value: 'canceled', label: 'Canceled' },
  ];

  return (
    <div className="relative inline-flex group">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="w-6 h-6 p-0 hover:cursor-pointer hover:bg-accent">
            <Bell strokeWidth={2} className="size-3.5 mt-[1px] p-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="grid gap-4">
            <Command>
              <div>{selectedStatus ? selectedStatus.label : 'Coin'}</div>
              <CommandInput
                placeholder="Search coin"
                onFocus={() => setIsCommandOpen(true)} // 포커스 시 열기
                onBlur={() => setIsCommandOpen(false)} // 포커스 해제 시 닫기
              />
              {isCommandOpen && ( // 조건부 렌더링
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  <CommandGroup>
                    {statuses.map(status => (
                      <CommandItem
                        key={status.value}
                        value={status.value}
                        onSelect={value => {
                          setSelectedStatus(statuses.find(priority => priority.value === value) || null);
                          setIsCommandOpen(false); // 선택 시 닫기
                        }}>
                        {status.label}
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
