import { createContext } from 'react';

// 거래소별로 입금·출금이 멈춘 코인만 담는다. { bithumb: { XRP: { deposit: false, withdraw: true } } }
export type WalletStatus = Record<string, Record<string, { deposit: boolean; withdraw: boolean }>>;

export const WalletStatusContext = createContext<WalletStatus>({});
