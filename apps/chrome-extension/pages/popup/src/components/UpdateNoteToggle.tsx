import { NotebookText } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';

export const UpdateNoteToggle = ({ updatedVersion }: { updatedVersion: string }) => {
  const updateNoteHandler = () => {
    // const url = 'https://trusted-surf-f62.notion.site/COMO-15f29bb357f98026be3dd2c062a18257';
    // window.open(url, '_blank', 'noopener,noreferrer');
    chrome.tabs.create({ url: 'https://trusted-surf-f62.notion.site/COMO-15f29bb357f98026be3dd2c062a18257' });
    if (updatedVersion?.length) {
      chrome.storage.local.set({ updatedVersion: updatedVersion });
    }
  };
  return (
    <Toggle
      className="relative hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1 group"
      variant="outline"
      onClick={updateNoteHandler}>
      <NotebookText size={14} strokeWidth={2} className={`${updatedVersion?.length && 'text-red-500'}`} />
      <span
        className={`absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity`}>
        Update note
      </span>
    </Toggle>
  );
};
