import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// index.css의 @theme에 정의한 글자 크기(text-cap 등)를 글자 색으로 오인해 지우지 않도록 알려 준다.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["cap-xs", "cap-s", "cap", "body-s", "body", "title-s", "title", "display"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
