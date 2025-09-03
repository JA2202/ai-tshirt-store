// lib/templates.ts
export type ThemeKey = "couples" | "pets";

type Template = {
  id: string;
  label: string;
  /** Base prompt fragment; we’ll add your common tokens automatically. */
  prompt: string;
  /** Default transparent preference for this template. */
  defaultTransparent?: boolean;
  /** Optional fields the UI can ask for (kept super light for MVP). */
  fields?: ("names" | "initials" | "date")[];
};

export const THEMES: Record<ThemeKey, { label: string; templates: Template[] }> = {
  couples: {
    label: "Couples",
    templates: [
      {
        id: "arcade",
        label: "Arcade — Player 1 & 2",
        prompt:
          "character select screen of a couple, retro arcade vibe, bold outlines, sticker-style",
        defaultTransparent: true,
      },
      {
        id: "space_fantasy",
        label: "Space-fantasy heroes",
        prompt:
          "epic space-fantasy warrior duo with glowing swords, cinematic lighting, poster composition",
      },
      {
        id: "wedding_crest",
        label: "Wedding crest",
        prompt:
          "elegant crest with {INITIALS}, refined floral frame, minimal line-art",
        defaultTransparent: true,
        fields: ["initials", "date"],
      },
      {
        id: "comic_cover",
        label: "Comic cover heroes",
        prompt:
          "comic book cover of the couple as heroes, dynamic poses, halftone shading, bold title",
      },
    ],
  },

  pets: {
    label: "Pets",
    templates: [
      {
        id: "mugshot",
        label: "Cute mugshot",
        prompt:
          "pet prison mugshot, holding a card with 'Snack Thief', playful, sticker-style",
        defaultTransparent: true,
      },
      {
        id: "barista",
        label: "Barista pet",
        prompt:
          "pet as a barista pouring latte art, top-down cup view, cozy cafe mood",
      },
      {
        id: "superhero",
        label: "Superhero pet",
        prompt:
          "superhero pet mid-flight with cape, comic action burst behind, high energy",
      },
    ],
  },
};

/** Builds the final prompt from a template + optional field values. */
export function buildTemplatePrompt(opts: {
  templatePrompt: string;
  transparent: boolean;
  fields?: { names?: string; initials?: string; date?: string };
}) {
  const { templatePrompt, transparent, fields } = opts;

  // Replace simple tokens if present (keep it minimal for MVP)
  let p = templatePrompt;
  if (fields?.names)    p = p.replaceAll("{NAMES}", fields.names);
  if (fields?.initials) p = p.replaceAll("{INITIALS}", fields.initials.toUpperCase());
  if (fields?.date)     p = p.replaceAll("{DATE}", fields.date);

  const parts = [p];
  if (transparent) {
    parts.push("transparent background, sticker-style, no backdrop, no shadows");
  }
  // Your standard quality tokens
  parts.push("high contrast, sharp, high-quality");
  return parts.filter(Boolean).join(", ");
}