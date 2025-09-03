// app/generate/[theme]/page.tsx
import { THEMES, type ThemeKey } from "../themes";
import ThemedGenerateClient from "./ThemedGenerateClient";

export function generateStaticParams() {
  return Object.keys(THEMES).map((theme) => ({ theme }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ theme: string }>;
}) {
  const { theme: themeParam } = await params;
  const key = (themeParam || "couples") as ThemeKey;
  const theme = THEMES[key] ?? THEMES.couples;
  return {
    title: theme.title,
    description: theme.subtitle,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ theme: string }>;
}) {
  const { theme: themeParam } = await params;
  const key = (themeParam || "couples") as ThemeKey;
  const theme = THEMES[key] ?? THEMES.couples;
  return <ThemedGenerateClient themeKey={key} theme={theme} />;
}