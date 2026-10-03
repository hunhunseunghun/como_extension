interface IconProps {
  text?: string;
}

export const WarningIcon = ({ text = '유' }: IconProps) => {
  return (
    <div className="flex shrink-0 items-center justify-center w-3 h-3 bg-warning rounded-xs">
      <span className="text-on-solid text-[9px] font-bold">{text}</span>
    </div>
  );
};

export const CautionIcon = ({ text = '주' }: IconProps) => {
  return (
    <div className="flex shrink-0 items-center justify-center w-3 h-3 bg-critical rounded-xs">
      <span className="text-on-solid text-[9px] font-bold">{text}</span>
    </div>
  );
};
