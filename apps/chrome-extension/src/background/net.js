// @ts-check
/**
 * JSON을 받는다. 2xx가 아니면 주소·상태 코드를 담은 오류를 던진다.
 * @param {string} url
 * @returns {Promise<any>}
 */
export const fetchJson = async url => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
};
