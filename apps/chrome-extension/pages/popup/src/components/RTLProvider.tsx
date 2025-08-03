import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isRTL } from '@/i18n/formatters';

interface RTLContextType {
  isRTL: boolean;
  direction: 'ltr' | 'rtl';
}

const RTLContext = createContext<RTLContextType>({
  isRTL: false,
  direction: 'ltr',
});

export const useRTL = () => {
  const context = useContext(RTLContext);
  if (!context) {
    throw new Error('useRTL must be used within an RTLProvider');
  }
  return context;
};

interface RTLProviderProps {
  children: React.ReactNode;
}

export const RTLProvider: React.FC<RTLProviderProps> = ({ children }) => {
  const { i18n } = useTranslation();
  const [rtlState, setRTLState] = useState<RTLContextType>({
    isRTL: isRTL(i18n.language),
    direction: isRTL(i18n.language) ? 'rtl' : 'ltr',
  });

  useEffect(() => {
    const rtl = isRTL(i18n.language);
    const direction = rtl ? ('rtl' as const) : ('ltr' as const);

    setRTLState({ isRTL: rtl, direction: direction as 'ltr' | 'rtl' });

    // HTML 문서의 dir 속성 설정
    document.documentElement.dir = direction;
    document.documentElement.lang = i18n.language;

    // CSS 변수 설정
    document.documentElement.style.setProperty('--direction', direction);
    document.documentElement.style.setProperty('--text-align', rtl ? 'right' : 'left');
    document.documentElement.style.setProperty('--float-start', rtl ? 'right' : 'left');
    document.documentElement.style.setProperty('--float-end', rtl ? 'left' : 'right');
    document.documentElement.style.setProperty('--margin-start', rtl ? 'margin-right' : 'margin-left');
    document.documentElement.style.setProperty('--margin-end', rtl ? 'margin-left' : 'margin-right');
    document.documentElement.style.setProperty('--padding-start', rtl ? 'padding-right' : 'padding-left');
    document.documentElement.style.setProperty('--padding-end', rtl ? 'padding-left' : 'padding-right');
    document.documentElement.style.setProperty('--border-start', rtl ? 'border-right' : 'border-left');
    document.documentElement.style.setProperty('--border-end', rtl ? 'border-left' : 'border-right');
  }, [i18n.language]);

  return (
    <RTLContext.Provider value={rtlState}>
      <div dir={rtlState.direction} lang={i18n.language}>
        {children}
      </div>
    </RTLContext.Provider>
  );
};

// RTL 스타일 유틸리티 컴포넌트
interface RTLDivProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const RTLDiv: React.FC<RTLDivProps> = ({ children, className = '', ...props }) => {
  const { direction } = useRTL();

  return (
    <div dir={direction} className={`rtl-${direction} ${className}`} {...props}>
      {children}
    </div>
  );
};

// RTL 텍스트 정렬 컴포넌트
interface RTLTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  className?: string;
}

export const RTLText: React.FC<RTLTextProps> = ({ children, className = '', ...props }) => {
  const { isRTL } = useRTL();

  return (
    <span className={`rtl-text ${isRTL ? 'text-right' : 'text-left'} ${className}`} {...props}>
      {children}
    </span>
  );
};

// RTL 아이콘 컴포넌트 (방향에 따라 아이콘 뒤집기)
interface RTLIconProps {
  children: React.ReactNode;
  className?: string;
  flip?: boolean; // 강제로 뒤집을지 여부
}

export const RTLIcon: React.FC<RTLIconProps> = ({ children, className = '', flip = false, ...props }) => {
  const { isRTL } = useRTL();
  const shouldFlip = flip || isRTL;

  return (
    <span className={`rtl-icon ${shouldFlip ? 'transform scale-x-[-1]' : ''} ${className}`} {...props}>
      {children}
    </span>
  );
};

// RTL 테이블 컴포넌트
interface RTLTableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
  className?: string;
}

export const RTLTable: React.FC<RTLTableProps> = ({ children, className = '', ...props }) => {
  const { direction } = useRTL();

  return (
    <table dir={direction} className={`rtl-table ${className}`} {...props}>
      {children}
    </table>
  );
};

// RTL 입력 필드 컴포넌트
interface RTLInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export const RTLInput: React.FC<RTLInputProps> = ({ className = '', ...props }) => {
  const { isRTL } = useRTL();

  return (
    <input
      dir={isRTL ? 'rtl' : 'ltr'}
      className={`rtl-input ${isRTL ? 'text-right' : 'text-left'} ${className}`}
      {...props}
    />
  );
};

// RTL 버튼 컴포넌트
interface RTLButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

export const RTLButton: React.FC<RTLButtonProps> = ({ children, className = '', ...props }) => {
  const { isRTL } = useRTL();

  return (
    <button
      dir={isRTL ? 'rtl' : 'ltr'}
      className={`rtl-button ${isRTL ? 'text-right' : 'text-left'} ${className}`}
      {...props}>
      {children}
    </button>
  );
};
