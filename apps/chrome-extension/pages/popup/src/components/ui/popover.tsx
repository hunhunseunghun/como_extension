import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@/lib/utils';

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  // 열 때 첫 입력칸 대신 패널 자체에 포커스를 둔다. 열자마자 셀렉트·입력에 포커스 링이 생기지 않고, Tab으로 바로 이동할 수 있다.
  onOpenAutoFocus = event => {
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.focus();
  },
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        // 팝업(430px)보다 긴 패널은 화면 안에서 스크롤한다.
        collisionPadding={4}
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          'bg-layer-floating text-fg-neutral data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 max-h-(--radix-popover-content-available-height) overflow-y-auto light-scrollbar dark-scrollbar origin-(--radix-popover-content-transform-origin) rounded-md border border-stroke-weak p-4 shadow-md outline-hidden',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
