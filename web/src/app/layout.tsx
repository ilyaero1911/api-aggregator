import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";
import { loadUsdRate } from "@/lib/server-data";
import { Reveal } from "@/components/reveal";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Strelka — один API для всех нейросетей", template: "%s · Strelka" },
  description: "OpenAI-совместимый шлюз к языковым моделям с оплатой в рублях.",
  icons: { icon: "/icon.svg" },
};

// Тема ставится до отрисовки, чтобы не мигало.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, usdRate] = await Promise.all([getLang(), loadUsdRate()]);
  return (
    <html lang={lang} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <I18nProvider lang={lang} usdRate={usdRate}>
          <ToastProvider>{children}<Reveal /></ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
