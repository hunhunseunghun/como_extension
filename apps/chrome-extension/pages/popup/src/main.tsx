import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import App from './App.tsx'
import { I18nProvider } from '@/i18n'
import { applyDesignVersion, readDesignVersion } from '@/lib/designVersion'

// 첫 그림부터 고른 디자인 버전으로 그리도록 렌더 전에 적용한다.
applyDesignVersion(readDesignVersion())

// ?view=mini 는 즐겨찾기만 보여 주는 미니 창이다.
const isMini = new URLSearchParams(location.search).get('view') === 'mini'
// 미니 창 화면은 팝업 첫 화면 번들에 넣지 않는다.
const MiniApp = lazy(() => import('./MiniApp.tsx').then(m => ({ default: m.MiniApp })))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>{isMini ? <Suspense fallback={null}><MiniApp /></Suspense> : <App />}</I18nProvider>
  </StrictMode>,
)
