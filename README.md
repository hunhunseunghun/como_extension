<div align="center"><img src="./apps/chrome-extension/public/como-logo.png"  width="120" height="120" />
<br>
<br>
<div style="font-size: 30px; font-weight: bold;">como</div>
<div style="font-size: 15px; font-weight: bold;">(암호화폐 시세조회 익스텐션)</div>
</div>

## 프로젝트 소개

암호화폐 시세를 빠르고 간편하게 조회할 수 있는 브라우저 확장프로그램입니다. 주요 암호화폐 거래소들의 종목 가격을 제공합니다.

<img src="./apps/chrome-extension//public/como_introduce.gif"/>

## 기술

<p align=""> 
<img alt="typescript" src ="https://img.shields.io/badge/typescript-white.svg?&style=for-the-badge&logo=typescript&logoColor=#3178C6"/>
<img alt="react" src ="https://img.shields.io/badge/react-white.svg?&style=for-the-badge&logo=react&logoColor=61DAFB"/>
<img alt="vite" src ="https://img.shields.io/badge/vite-white.svg?&style=for-the-badge&logo=vite&logoColor=#646CFF"/>
  <img alt="turborepo" src ="https://img.shields.io/badge/turborepo-white.svg?&style=for-the-badge&logo=turborepo&logoColor=#EF4444"/>
<img alt="websocket" src ="https://img.shields.io/badge/websocket-white.svg?&style=for-the-badge&logo=socketdotio&logoColor=black"/>
<img alt="chromeapi" src ="https://img.shields.io/badge/chromeapi-white.svg?&style=for-the-badge&logo=chromewebstore&logoColor=#4285F4"/>
<img alt="shadcnui" src ="https://img.shields.io/badge/shadcnui-white?&style=for-the-badge&logo=shadcnui&logoColor=black"/>
<img alt="tailwindcss" src ="https://img.shields.io/badge/tailwindcss-white?&style=for-the-badge&logo=tailwindcss&logoColor=#06B6D4"/>

## 디렉토리

```
como
   ├ packages                        # 애플리케이션에서 공유하는 모듈(타입,UI,Config)
   └ *apps                           # Turborepo의 애플리케이션 단위 프로젝트 폴더
       └ *chrome-extension           # Chrome 브라우저용 확장 프로그램
           ├ dist                    # Vite로 빌드된 최종 번들 파일이 저장되는 폴더
           ├ public                  # 메타데이터와 권한을 정의하는 manifest.json이 위치
           ├ *src                    # 확장 프로그램의 핵심 소스 코드
              └ *background          # Chrome 확장의 background script 및 Fetching,WebSocket 로직
           └ *pages                  # 확장 프로그램의 UI 페이지 구성
              └ *popup               # 확장 프로그램의 팝업 페이지
                 └ *src              # 팝업 페이지 관련 소스 코드
                    ├ *components    # 재사용 가능한 컴포넌트
                    ├ *types         # TypeScript 인터페이스 및 타입 정의
                    ├ *styles        # Tailwind CSS 스타일 파일
```

## Contributing

Contributions to Next.js are welcome and highly appreciated. However, before you jump right into it, we would like you to review our [Contribution Guidelines](/vercel/next.js/blob/canary/contributing.md) to make sure you have a smooth experience contributing to Next.js.

### Good First Issues:

We have a list of **[good first issues](https://github.com/vercel/next.js/labels/good%20first%20issue)** that contain bugs that have a relatively limited scope. This is a great place for newcomers and beginners alike to get started, gain experience, and get familiar with our contribution process.

---

## Security

If you believe you have found a security vulnerability in Next.js, we encourage you to **_responsibly disclose this and NOT open a public issue_**. We will investigate all legitimate reports. Email `security@vercel.com` to disclose any security vulnerabilities. Alternatively, you can visit this [link](https://vercel.com/security) to know more about Vercel's security and report any security vulnerabilities.
