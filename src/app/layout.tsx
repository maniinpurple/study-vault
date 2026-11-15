import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { DEFAULT_LAYOUT, DEFAULT_STYLE, bootScript } from "@/lib/appearance";
import { DEFAULT_THEME, STORAGE_KEYS, THEME_ATTRIBUTE } from "@/lib/constants";
import { DEFAULT_UI_LANGUAGE, getDictionary } from "@/lib/i18n";

import "./globals.css";

// The one interface face for every language and style. Inter ships a Vietnamese subset (full diacritics), so English and
// Vietnamese render in exactly the same font. (DESIGN_SYSTEM.md §3)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
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

/** Applies the saved mode, language, style, layout and accent before first paint so reloads never flash the wrong look. */
const BOOT_SCRIPT = bootScript(STORAGE_KEYS.prefs);

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      data-theme={DEFAULT_STYLE}
      data-mode={THEME_ATTRIBUTE[DEFAULT_THEME]}
      data-layout={DEFAULT_LAYOUT}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
