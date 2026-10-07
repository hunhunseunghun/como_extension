// @ts-check
// 업비트 입출금 상태(순수 함수). /v1/status/wallet은 코인·네트워크(net_type)마다 한 줄씩 준다.
// 네트워크 하나라도 입금(출금)이 되면 그 코인은 입금(출금) 가능으로 본다. 둘 다 되는 코인은 빼고 막힌 코인만 돌려준다.

/** @param {unknown} list */
export function aggregateUpbitWallet(list) {
  /** @type {Record<string, { deposit: boolean, withdraw: boolean }>} */
  const byCoin = {};
  if (!Array.isArray(list)) return byCoin;
  for (const item of list) {
    const coin = item?.currency;
    if (!coin) continue;
    const state = item.wallet_state;
    const entry = (byCoin[coin] ??= { deposit: false, withdraw: false });
    if (state === 'working' || state === 'deposit_only') entry.deposit = true;
    if (state === 'working' || state === 'withdraw_only') entry.withdraw = true;
  }
  for (const coin of Object.keys(byCoin)) {
    if (byCoin[coin].deposit && byCoin[coin].withdraw) delete byCoin[coin];
  }
  return byCoin;
}
