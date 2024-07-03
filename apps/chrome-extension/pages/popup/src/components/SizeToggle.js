import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Maximize, Minimize } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
export function SizeToggle({ wideSize, setWideSize, }) {
    const switchSize = () => (wideSize ? setWideSize(false) : setWideSize(true));
    return (_jsxs(Toggle, { className: "hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1", variant: "outline", onClick: switchSize, children: [wideSize ? _jsx(Maximize, { size: 14, strokeWidth: 2 }) : _jsx(Minimize, { size: 14, strokeWidth: 2 }), _jsx("span", { className: "sr-only", children: "toggle theme" })] }));
}
