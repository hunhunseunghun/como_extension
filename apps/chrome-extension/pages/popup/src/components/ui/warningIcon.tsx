interface IconProps {
  text?: string;
  // 마우스를 올리면 보이는 설명(주의 사유 등)
  title?: string;
}

export const WarningIcon = ({ text = '유', title }: IconProps) => {
  return (
    <div className="flex shrink-0 items-center justify-center w-3 h-3 bg-warning rounded-xs" title={title}>
      <span className="text-on-solid text-[9px] font-bold">{text}</span>
    </div>
  );
};

export const CautionIcon = ({ text = '주', title }: IconProps) => {
  return (
    <div
      className="flex shrink-0 items-center justify-center w-3 h-3 bg-critical rounded-xs"
      title={title}
      aria-label={title}
      data-testid="caution-icon">
      <span className="text-on-solid text-[9px] font-bold">{text}</span>
    </div>
  );
};
