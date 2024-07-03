import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
// ✅ 올바른 타입 정의
const marketTypes = ['KRW', 'BTC', 'USDT'];
export function MarketTypeDropDown({ upbitMarketType, setUpbitMarketType }) {
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", className: "h-6 w-15 text-[10px] font-semibold gap-1 hover:cursor-pointer", children: [_jsx("span", { children: upbitMarketType }), _jsx(ChevronDown, { className: "size-2.5" })] }) }), _jsx(DropdownMenuContent, { className: "min-w-[70px]", children: _jsx(DropdownMenuGroup, { children: marketTypes.map(type => (_jsx(DropdownMenuItem, { onClick: () => setUpbitMarketType(type), className: "gap-1 px-1 py-1 text-xs", children: type }, type))) }) })] }));
}
