interface IconProps {
  text?: string;
}

export const WarningIcon = ({ text = '유' }: IconProps) => {
  return (
    <div className="flex items-center justify-center w-3 h-3 bg-yellow-500 rounded-xs">
      <span className="text-white text-[9px] font-bold">{text}</span>
    </div>
  );
};

export const CautionIcon = ({ text = '주' }: IconProps) => {
  return (
    <div className="flex items-center justify-center w-3 h-3 bg-red-500 rounded-xs">
      <span className="text-white text-[9px] font-bold">{text}</span>
    </div>
  );
};
