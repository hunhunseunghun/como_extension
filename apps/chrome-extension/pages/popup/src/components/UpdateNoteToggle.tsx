import { NotebookText } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';

export const UpdateNoteToggle = () => {
  const openNewPopup = () => {
    // const url = 'https://trusted-surf-f62.notion.site/COMO-15f29bb357f98026be3dd2c062a18257';
    // window.open(url, '_blank', 'noopener,noreferrer');

    chrome.tabs.create({ url: 'https://trusted-surf-f62.notion.site/COMO-15f29bb357f98026be3dd2c062a18257' });
    console.log('update note open');
  };
  return (
    <Toggle
      className="relative hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1"
      variant="outline"
      onClick={openNewPopup}>
      <NotebookText size={14} strokeWidth={2} />
      <span className="absolute top-full mt-2 hidden w-max px-3 py-1 text-sm text-white bg-black rounded-md opacity-0 group-hover:block group-hover:opacity-100 transition-opacity">
        Update note
      </span>
    </Toggle>
  );
};
