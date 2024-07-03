import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import UpbitLogo from '@/assets/icons/upbit-logo.png';
// import BithumbLogo from '@/assets/icons/bithumb-logo.png';
// import CoinOneLogo from '@/assets/icons/coinone-logo.png';
// import BinanceLogo from '@/assets/icons/binance-logo.png';
import { ChevronDown } from 'lucide-react';
const platformData = {
    upbit: { key: 'upbit', label: '업비트', logo: UpbitLogo },
    // bithumb: { key: 'bithumb', label: '빗썸', logo: BithumbLogo },
    // coinone: { key: 'coinone', label: '코인원', logo: CoinOneLogo },
    // binance: { key: 'binance', label: '바이낸스', logo: BinanceLogo },
};
export const MarketDropdown = ({ exchangePlatform, setExchangePlatform }) => {
    const exchangeList = Object.values(platformData);
    const selectedPlatform = platformData[exchangePlatform] || platformData.upbit;
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", className: "h-6 w-20 text-[10px] font-semibold gap-1 hover:cursor-pointer", children: [_jsx("img", { src: selectedPlatform.logo, className: "size-3" }), _jsx("span", { children: selectedPlatform.label }), _jsx(ChevronDown, { className: "size-2.5" })] }) }), _jsx(DropdownMenuContent, { className: "min-w-[100px]", children: _jsx(DropdownMenuGroup, { children: exchangeList.map(({ key, label, logo }) => (_jsxs(DropdownMenuItem, { className: "gap-1 px-1 py-1 items-left text-xs", onClick: () => setExchangePlatform(key), children: [_jsx("img", { src: logo, className: "size-4" }), _jsx("span", { children: label })] }, key))) }) })] }));
};
