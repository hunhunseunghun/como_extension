import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const LoadingSpinner = ({ className }: { className?: string }) => {
  return (
    <div className="flex flex-col justify-center items-center">
      <Loader2 className={cn('w-5 h-5 animate-spin text-fg-subtle hover:bg-transparent', className)} />
      <span className="text-body-s text-fg-subtle">Loading...</span>
    </div>
  );
};
