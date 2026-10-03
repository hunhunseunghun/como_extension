import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// index.css의 @theme에 정의한 이름(글자 크기 text-cap, 굵기 font-heavy, 그림자 shadow-seg, 높이 h-control)을
// tailwind-merge에 알려 준다. 빠지면 text-cap을 글자색으로 오인해 지우거나, h-6과 h-control을 둘 다 남긴다.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["cap-xs", "cap-s", "cap", "body-s", "body", "title-s", "title", "display"],
      "font-weight": ["heavy"],
      shadow: ["seg"],
      spacing: ["control", "control-lg"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
