// app/generate/themes.ts
export type Preset = {
  key: string;
  label: string;
  token: string; // appended into the prompt
};

// Optional "How it works" section support
export type HowStep = {
  title: string;
  body: string;
  media: string;    // URL to .webp/.gif/.png in /public
  mediaAlt?: string;
};

export type ThemeConfig = {
  title: string;
  subtitle: string;
  dropzoneTitle?: string;
  dropzoneHelp?: string;
  styles: readonly Preset[];
  showcaseImages: readonly string[];
  precheck?: {
    title: string;
    description: string;
    goodExample: string; // path to .webp in /public
    badExample: string;  // path to .webp in /public
  };
  howItWorks?: readonly HowStep[];
};

export const THEMES = {
  couples: {
    title: "Turn Your Favourite Moment Into A Wearable",
    subtitle: "Upload a photo, choose a style, and we’ll generate it for you.",
    dropzoneTitle: "Upload a couple photo",
    dropzoneHelp: "PNG, JPG or WebP · clear, front-facing photos work best",
    styles: [
      { key: "arcade_duo",             label: "Arcade Duo (P1/P2)",  token: "Turn us into an arcade character select: Player 1 & Player 2 panels, bold retro UI" },
      { key: "jedi_partners",          label: "Jedi Partners",        token: "Us as Jedi partners with glowing sabers, cinematic lighting, adventure poster energy" },
      { key: "wedding_crest",          label: "Wedding Crest",        token: "Wedding invite-style crest with our initials, elegant floral frame, classic engraving" },
      { key: "space_high_five",        label: "Space High-Five",      token: "Us as astronauts doing a space high-five, planet rings and tiny stars behind" },
      { key: "pixel_duo",              label: "Pixel Duo",            token: "Pixel art duo, idle animation vibes, small heart pickup between us" },
      { key: "polaroid_strip",         label: "Polaroid Strip",       token: "Polaroid photo booth strip of us: four mini frames, cute expressions" },
      { key: "comic_cover",            label: "Comic Book Cover",     token: "Comic book cover of us as heroes, bold title and issue number, halftone shading" },
      { key: "cozy_cafe",              label: "Cozy Café",            token: "Cozy cafe illustration: us sharing one giant milkshake, two straws" },
      { key: "synthwave_duo",          label: "Synthwave Silhouette", token: "Neon synthwave silhouette of us under a grid sunset, retro-futuristic palette" },
      { key: "travel_scooter",         label: "Travel Scooter",       token: "Minimal travel poster: us on a scooter, breeze lines, city badge" },
      { key: "band_poster",            label: "Band Poster",          token: "Band poster: our duo name in big letters, tour dates as easter eggs" },
      { key: "superhero_back_to_back", label: "Superhero Duo",        token: "Superhero partners back-to-back, dramatic lighting and lightning background" },
      { key: "other",                  label: "Choose Your Own Style", token: "" },
    ] as const,
    showcaseImages: [
      "/showcase/couples/1.webp",
      "/showcase/couples/2.webp",
      "/showcase/couples/3.webp",
      "/showcase/couples/4.webp",
      "/showcase/couples/5.webp",
    ] as const,
    precheck: {
      title: "Are both of your faces visible?",
      description: "Front-facing, well-lit photos work best. Avoid cropped faces or blurry images.",
      goodExample: "/precheck/couples-good.webp",
      badExample: "/precheck/couples-bad.webp",
    },
    howItWorks: [
      {
        title: "Upload a clear couple photo",
        body: "Drop a front-facing, well-lit photo. We’ll show you a quick tip screen so you know it’s good to go.",
        media: "/how/couples/1.webp",
        mediaAlt: "Upload step illustration",
      },
      {
        title: "Pick a style & generate",
        body: "Choose a preset like Jedi Partners, Arcade Duo, or Wedding Crest. We handle the prompt and generate multiple options.",
        media: "/how/couples/2.gif",
        mediaAlt: "Style selection and generation demo",
      },
      {
        title: "Edit & print on products",
        body: "Select your favourite, tweak it in the editor (size, placement, text), then add to tees or hoodies and checkout.",
        media: "/how/couples/3.webp",
        mediaAlt: "Editing/printing step",
      },
    ] as const,
  },

  pets: {
    title: "Turn Your Pet Into a Fun T-Shirt",
    subtitle: "Upload a pet photo and pick a fun style.",
    dropzoneTitle: "Upload a pet photo",
    dropzoneHelp: "PNG, JPG or WebP · clear, front-facing photos work best",
    styles: [
      { key: "pet_jedi",      label: "Jedi Pet",       token: "Jedi pet in tiny armor, heroic pose, holding lightsaber" },
      { key: "pet_barista",   label: "Barista Pet",    token: "My pet as a barista pouring latte art themselves, top-down cup view" },
      { key: "pet_mugshot",   label: "Mugshot Pet",    token: "Turn my pet into a prison mugshot, striped outfit, holding a sign that says 'snack thief'" },
      { key: "pet_chef",      label: "Chef Pet",       token: "My pet as a chef tossing pizza dough, flour poofs in the air" },
      { key: "pet_superhero", label: "Superhero Pet",  token: "Superhero pet mid-flight with a cape and comic action burst" },
      { key: "pet_astronaut", label: "Astronaut Pet",  token: "Astronaut pet floating with a space snack, tiny planet nearby" },
      { key: "pet_pixel",     label: "Pixel Pet",      token: "Retro 8-bit pixel sprite of my pet with idle animation vibe" },
      { key: "pet_portrait",  label: "Royal Pet",      token: "Royal portrait of my pet in a velvet coat and ruff collar, classic oil painting style" },
      { key: "pet_dj",        label: "DJ Pet",         token: "My pet DJ at turntables, nightclub crowd silhouettes, floating music notes" },
      { key: "pet_mailman_boss",   label: "Fighter Pet",     token: "My pet as a video game boss guarding the door, pixel HUD, 'Defeat the Mailman!'" },
      { key: "pet_supermodel",     label: "Supermodel Pet",      token: "My pet strutting on a catwalk, fashion spotlights, dramatic wind fan, glossy floor" },
      { key: "other",         label: "Choose Your Own Style", token: "" },
    ] as const,
    showcaseImages: [
      "/showcase/pets/1.webp",
      "/showcase/pets/2.webp",
      "/showcase/pets/3.webp",
      "/showcase/pets/4.webp",
      "/showcase/pets/5.webp",
    ] as const,
    precheck: {
      title: "Pick a clear pet photo",
      description: "Front-facing, well-lit photos work best. Blurry or cropped photos can cause odd results.",
      goodExample: "/precheck/pets-good.webp",
      badExample: "/precheck/pets-bad.webp",
    },
    howItWorks: [
      {
        title: "Upload a photo of your pet",
        body: "Use a clear, front-facing shot. We’ll quickly show you what a good example looks like before generation.",
        media: "/how/pets/1.gif",
        mediaAlt: "Upload pet photo",
      },
      {
        title: "Choose a fun style & generate",
        body: "Pick from presets like Jedi Pet, Barista Pet, or Mugshot. We generate multiple options automatically.",
        media: "/how/pets/2.gif",
        mediaAlt: "Select style and generate",
      },
      {
        title: "Edit & place on merch",
        body: "Fine-tune your favourite in the editor, preview on products, and checkout securely.",
        media: "/how/pets/3.gif",
        mediaAlt: "Edit and print",
      },
    ] as const,
  },
} as const;

export type ThemeKey = keyof typeof THEMES; // "couples" | "pets" | ...