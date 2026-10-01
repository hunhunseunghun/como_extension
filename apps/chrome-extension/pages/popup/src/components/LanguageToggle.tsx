import { Languages } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { LANGUAGES, useI18n } from '@/i18n';

export const LanguageToggle = () => {
  const { language, setLanguage, t } = useI18n();
  const currentIndex = LANGUAGES.findIndex(({ value }) => value === language);
  const next = LANGUAGES[(currentIndex + 1) % LANGUAGES.length];

  return (
    <Toggle
      className="relative hover:cursor-pointer hover:bg-accent size-6 min-w-6 border-1 group"
      variant="outline"
      aria-label={t('language')}
      onClick={() => setLanguage(next.value)}>
      <Languages size={14} strokeWidth={2} />
      <span className="absolute right-0 top-full mt-2 hidden w-max px-2 py-1 text-xs text-white bg-black rounded-md opacity-50 group-hover:block group-hover:opacity-90 transition-opacity z-49">
        {`${t('language')}: ${next.label}`}
      </span>
    </Toggle>
  );
};
