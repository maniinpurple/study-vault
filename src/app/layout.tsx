import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

import { DEFAULT_THEME, STORAGE_KEYS, THEME_ATTRIBUTE } from "@/lib/constants";
import { DEFAULT_UI_LANGUAGE, getDictionary } from "@/lib/i18n";

import "./globals.css";

// Inter ships a Vietnamese subset (full diacritics support).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

// Reading face for titles, questions and solutions (DESIGN_SYSTEM.md §3).
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
});

// Markdown/LaTeX source and keyboard hints.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "vietnamese"],
});

const dict = getDictionary(DEFAULT_UI_LANGUAGE);

export const metadata: Metadata = {
  title: { default: dict.app.name, template: `%s · ${dict.app.name}` },
  description: dict.app.tagline,
};

/** Applies the saved theme/lang before first paint so reloads never flash the wrong theme. */
const PREFS_SCRIPT = `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEYS.prefs)})||"null");if(p){var d=document.documentElement;if(p.theme)d.dataset.theme=p.theme==="light"?"light":"dark";if(p.lang)d.lang=p.lang}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      data-theme={THEME_ATTRIBUTE[DEFAULT_THEME]}
      suppressHydrationWarning
      className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
