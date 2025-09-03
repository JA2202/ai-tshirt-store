// app/generate/[theme]/page.tsx
import { THEMES, type ThemeKey } from "../themes";
import ThemedGenerateClient from "./ThemedGenerateClient";

export function generateStaticParams() {
  return Object.keys(THEMES).map((theme) => ({ theme }));
}

export function generateMetadata({ params }: { params: { theme: string } }) {
  const key = (params.theme || "couples") as ThemeKey;
  const theme = THEMES[key] ?? THEMES.couples;
  return {
    title: theme.title,
    description: theme.subtitle,
  };
}

export default function Page({ params }: { params: { theme: string } }) {
  const key = (params.theme || "couples") as ThemeKey;
  const theme = THEMES[key] ?? THEMES.couples;
  return <ThemedGenerateClient themeKey={key} theme={theme} />;
}