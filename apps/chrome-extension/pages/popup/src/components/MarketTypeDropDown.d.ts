declare const marketTypes: readonly ["KRW", "BTC", "USDT"];
type UpbitMarketType = (typeof marketTypes)[number];
interface MarketTypeDropDownProps {
    upbitMarketType: UpbitMarketType;
    setUpbitMarketType: (type: UpbitMarketType) => void;
}
export declare function MarketTypeDropDown({ upbitMarketType, setUpbitMarketType }: MarketTypeDropDownProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=MarketTypeDropDown.d.ts.map