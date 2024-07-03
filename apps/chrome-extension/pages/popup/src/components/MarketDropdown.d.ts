declare const platformData: {
    readonly upbit: {
        readonly key: "upbit";
        readonly label: "업비트";
        readonly logo: string;
    };
};
interface MarketDropdownProps {
    exchangePlatform: 'upbit';
    setExchangePlatform: (platform: keyof typeof platformData) => void;
}
export declare const MarketDropdown: ({ exchangePlatform, setExchangePlatform }: MarketDropdownProps) => import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=MarketDropdown.d.ts.map