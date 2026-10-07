export const fetchJson = async url => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
};
