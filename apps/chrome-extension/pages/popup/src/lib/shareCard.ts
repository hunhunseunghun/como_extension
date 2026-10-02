// 공유 카드: 1200×630 이미지를 캔버스로 그려 클립보드에 복사하고, 안 되면 PNG로 내려받는다.
// 금액은 넣지 않고 비율·지표만 넣어 개인 자산이 드러나지 않게 한다.

export type ShareLine = { label: string; value: string; tone?: 'up' | 'down' | 'neutral' };
export type ShareCard = {
  title: string;
  headline: string;
  headlineTone?: 'up' | 'down' | 'neutral';
  lines: ShareLine[];
};

const WIDTH = 1200;
const HEIGHT = 630;
const FONT = "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif";
const STORE_TEXT = 'COMO · Crypto Price Tracker';

const readToken = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export const renderShareCard = (card: ShareCard): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const up = readToken('--como-up', '#ef4444');
  const down = readToken('--como-down', '#3b82f6');
  const toneColor = (tone?: ShareLine['tone']) => (tone === 'up' ? up : tone === 'down' ? down : '#f3f4f5');

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#16171b');
  gradient.addColorStop(1, '#2b2e35');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#b0b3ba';
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(card.title, 80, 120);

  ctx.fillStyle = toneColor(card.headlineTone);
  ctx.font = `800 120px ${FONT}`;
  ctx.fillText(card.headline, 80, 270);

  card.lines.slice(0, 4).forEach((line, index) => {
    const y = 370 + index * 56;
    ctx.fillStyle = '#868b94';
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(line.label, 80, y);
    ctx.fillStyle = toneColor(line.tone);
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(line.value, 420, y);
  });

  ctx.fillStyle = '#868b94';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(new Date().toLocaleString(), 80, HEIGHT - 60);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f3f4f5';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(STORE_TEXT, WIDTH - 80, HEIGHT - 60);
  return canvas;
};

export type ShareResult = 'copied' | 'downloaded';

export const shareCard = async (card: ShareCard): Promise<ShareResult> => {
  const canvas = renderShareCard(card);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(value => (value ? resolve(value) : reject(new Error('toBlob failed'))), 'image/png'),
  );
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return 'copied';
  } catch {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `como-${Date.now()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }
};
