import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const LoadingSpinner = ({ className }: { className?: string }) => {
  return (
    <div className="flex flex-col justify-center items-center">
      <Loader2 className={cn('w-5 h-5 animate-spin text-gray-500', className)} />
      <span className="text-xs text-gray-500">Loading...</span>
    </div>
  );
};
