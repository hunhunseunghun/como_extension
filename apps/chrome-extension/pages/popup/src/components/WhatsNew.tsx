import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/iconButton';
import { useI18n, type MessageKey } from '@/i18n';

const UPDATE_NOTE_URL = 'https://trusted-surf-f62.notion.site/COMO-15f29bb357f98026be3dd2c062a18257';
// 이번 버전에서 앱 안에서 알려 줄 새 기능. 버전을 올릴 때 문구를 바꾼다.
const ITEMS: MessageKey[] = ['whatsNew1', 'whatsNew2', 'whatsNew3'];

type Props = { updatedVersion: string; onDismiss: () => void };

// 업데이트한 사용자에게 한 번만 새 기능을 보여 준다. 닫거나 자세히 보면 다시 뜨지 않는다(updatedVersion 저장).
export const WhatsNew = ({ updatedVersion, onDismiss }: Props) => {
  const { t } = useI18n();
  if (!updatedVersion) return null;

  const dismiss = () => {
    chrome.storage.local.set({ updatedVersion });
    onDismiss();
  };

  return (
    <div
      className="absolute top-9 left-2 right-2 z-[49] rounded-md border bg-layer-floating px-2 py-1.5 text-cap shadow-lg"
      data-testid="whats-new">
      <div className="flex items-center gap-1 mb-1">
        <Sparkles className="size-3.5 shrink-0 text-star" />
        <span className="flex-1 font-semibold">
          {t('whatsNewTitle').replace('{v}', chrome.runtime.getManifest?.().version ?? '')}
        </span>
        <IconButton aria-label={t('close')} onClick={dismiss}>
          <X />
        </IconButton>
      </div>
      <ul className="mb-1 list-disc pl-4 text-fg-muted">
        {ITEMS.map(key => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button
          variant="soft"
          className="h-control px-2 text-cap-s hover:cursor-pointer"
          onClick={() => {
            chrome.tabs.create({ url: UPDATE_NOTE_URL });
            dismiss();
          }}>
          {t('whatsNewMore')}
        </Button>
      </div>
    </div>
  );
};
