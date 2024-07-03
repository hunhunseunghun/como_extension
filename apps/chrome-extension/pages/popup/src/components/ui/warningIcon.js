import { jsx as _jsx } from "react/jsx-runtime";
export const WarningIcon = ({ text = '유' }) => {
    return (_jsx("div", { className: "flex items-center justify-center w-3 h-3 bg-yellow-500 rounded-xs", children: _jsx("span", { className: "text-white text-[9px] font-bold", children: text }) }));
};
export const CautionIcon = ({ text = '주' }) => {
    return (_jsx("div", { className: "flex items-center justify-center w-3 h-3 bg-red-500 rounded-xs", children: _jsx("span", { className: "text-white text-[9px] font-bold", children: text }) }));
};
