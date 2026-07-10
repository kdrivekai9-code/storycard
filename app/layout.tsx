import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Dancing_Script, Great_Vibes, Pinyon_Script, Parisienne,
  Playfair_Display, Lora,
} from "next/font/google";
import "./globals.css";

// 라틴 필기체 / 세리프 폰트 (next/font — Latin subset)
const cormorant    = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["300","400","600"], style: ["normal","italic"] });
const playfair     = Playfair_Display({  variable: "--font-playfair",   subsets: ["latin"], weight: ["400","600"], style: ["normal","italic"] });
const lora         = Lora({              variable: "--font-lora",        subsets: ["latin"], weight: ["400","600"], style: ["normal","italic"] });
const dancingScript = Dancing_Script({ variable: "--font-dancing",     subsets: ["latin"], weight: ["400","700"] });
const greatVibes    = Great_Vibes({    variable: "--font-great-vibes", subsets: ["latin"], weight: ["400"] });
const pinyonScript  = Pinyon_Script({  variable: "--font-pinyon",      subsets: ["latin"], weight: ["400"] });
const parisienne    = Parisienne({     variable: "--font-parisienne",  subsets: ["latin"], weight: ["400"] });

// 한국어 폰트는 Google Fonts CDN <link>로 로딩 (한글 전체 포함, globals.css :root에 CSS var 정의)

export const metadata: Metadata = {
  title: "CardStory — 모바일 청첩장",
  description: "취향에 맞는 모바일 청첩장을 몇 분 안에 만들어 보세요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className={[
        cormorant.variable, playfair.variable, lora.variable,
        dancingScript.variable, greatVibes.variable,
        pinyonScript.variable, parisienne.variable,
        "h-full antialiased",
      ].join(" ")}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* 한국어 폰트 — 한글 전체 포함 */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500&family=Noto+Serif+KR:wght@300;400;500&family=Nanum+Gothic:wght@400;700&family=Nanum+Myeongjo:wght@400;700&family=Black+Han+Sans&family=Jua&family=Nanum+Pen+Script&family=Gaegu&family=Gamja+Flower&family=Gowun+Batang&display=swap"
          rel="stylesheet"
        />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col" style={{ "--font-pretendard": "'Pretendard'" } as React.CSSProperties}>
        {children}
      </body>
    </html>
  );
}
