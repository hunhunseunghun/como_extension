import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
export const LoadingSpinner = ({ className }) => {
    return (_jsxs("div", { className: "flex flex-col justify-center items-center", children: [_jsx(Loader2, { className: cn('w-5 h-5 animate-spin text-gray-500', className) }), _jsx("span", { className: "text-xs text-gray-500", children: "Loading..." })] }));
};
