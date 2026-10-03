import { NotebookText } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { HoverHint } from '@/components/ui/hoverHint';
import { useI18n } from '@/i18n';

export const UpdateNoteToggle = ({ updatedVersion }: { updatedVersion: string }) => {
  const { t } = useI18n();
  const updateNoteHandler = () => {
    chrome.tabs.create({ url: 'https://trusted-surf-f62.notion.site/COMO-15f29bb357f98026be3dd2c062a18257' });
    if (updatedVersion?.length) {
      chrome.storage.local.set({ updatedVersion: updatedVersion });
    }
  };
  return (
    <Toggle
      className="relative hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1 group"
      variant="outline"
      aria-label={t('updateNote')}
      onClick={updateNoteHandler}>
      <NotebookText size={14} strokeWidth={2} className={updatedVersion?.length ? 'text-warning' : undefined} />
      <HoverHint tone={updatedVersion?.length ? 'warning' : 'default'} className="font-normal">
        {updatedVersion?.length ? t('updateNoteNew').replace('{v}', updatedVersion) : t('updateNote')}
      </HoverHint>
    </Toggle>
  );
};
