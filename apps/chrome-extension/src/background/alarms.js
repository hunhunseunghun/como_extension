// 같은 이름으로 다시 만들면 일정이 처음부터 다시 잡힌다. 서비스 워커가 깨어날 때마다 긴 주기 알람이 밀리지 않도록 없을 때만 만든다.
export function ensureAlarm(name, info) {
  chrome.alarms.get(name).then(existing => {
    if (!existing) chrome.alarms.create(name, info);
  });
}
