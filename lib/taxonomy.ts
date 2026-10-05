/**
 * Product taxonomy used by product grouping and mock catalogue fixtures.
 *
 * This is intentionally separate from the full browsing navigation in
 * `lib/navigation.ts`. It defines the product classification groups used by
 * the catalogue model, not every live-site menu destination.
 *
 * Product groups:
 * - Vector Creatives (Flyers, Logo Design, Social Media, Website, T-Shirts)
 * - Character Bundle (Cultural, Festival & Events, Mythological, People,
 *   Profession, Miscellaneous)
 * - Freebies
 *
 * Rules:
 * - Category/group names live here for product classification. Components,
 *   services and data modules resolve these names through these helpers.
 * - `data/categories.ts` builds its records from `productGroups`.
 * - Homepage discovery tiles (`lib/homepage.ts`) are a separate discovery
 *   layer and intentionally do NOT reuse these names.
 */

export interface TaxonomySubcategory {
  slug: string;
  name: string;
  description: string;
}

export interface TaxonomyGroup {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  subcategories: TaxonomySubcategory[];
}

export const productGroups: TaxonomyGroup[] = [
  {
    slug: "vector-creatives",
    name: "Vector Creatives",
    tagline: "Ready-to-use Indian design creatives",
    description:
      "Individual vector graphics: flyers, logos, social media, website graphics and T-shirt prints.",
    subcategories: [
      {
        slug: "flyers",
        name: "Flyers",
        description: "Promotional flyers for local businesses and events.",
      },
      {
        slug: "logo-design",
        name: "Logo Design",
        description: "Logo templates, badges and identity starters.",
      },
      {
        slug: "social-media",
        name: "Social Media",
        description: "Banners, posts and marketing creatives.",
      },
      {
        slug: "website",
        name: "Website",
        description: "Hero art and graphics for websites.",
      },
      {
        slug: "t-shirts",
        name: "T-Shirts",
        description: "Print-ready T-shirt graphics and desi statements.",
      },
    ],
  },
  {
    slug: "character-bundle",
    name: "Character Bundle",
    tagline: "Consistent characters in every pose",
    description:
      "Character bundles with the same figures in varied actions and poses.",
    subcategories: [
      {
        slug: "cultural",
        name: "Cultural",
        description: "Dancers, weddings and living traditions.",
      },
      {
        slug: "festival-events",
        name: "Festival & Events",
        description: "Garba nights, Janmashtami and festive figures.",
      },
      {
        slug: "mythological",
        name: "Mythological",
        description: "Gods, epics and divine characters.",
      },
      {
        slug: "people",
        name: "People",
        description: "Everyday Indian people and street characters.",
      },
      {
        slug: "profession",
        name: "Profession",
        description: "Doctors, farmers and working professionals.",
      },
      {
        slug: "miscellaneous",
        name: "Miscellaneous",
        description: "Characters that fit everywhere else.",
      },
    ],
  },
  {
    slug: "freebies",
    name: "Freebies",
    tagline: "Top-notch free assets",
    description: "Free vectors, icons and colouring pages.",
    subcategories: [],
  },
];

/** Top-level group slugs, e.g. `["vector-creatives", …]`. */
export function groupSlugs(): string[] {
  return productGroups.map((group) => group.slug);
}

/** Every slug in the taxonomy (groups + subcategories). */
export function allCategorySlugs(): string[] {
  return productGroups.flatMap((group) => [
    group.slug,
    ...group.subcategories.map((sub) => sub.slug),
  ]);
}

export function getGroup(slug: string): TaxonomyGroup | null {
  return productGroups.find((group) => group.slug === slug) ?? null;
}

export function getSubcategory(
  slug: string,
): { group: TaxonomyGroup; subcategory: TaxonomySubcategory } | null {
  for (const group of productGroups) {
    const subcategory = group.subcategories.find((sub) => sub.slug === slug);
    if (subcategory) return { group, subcategory };
  }
  return null;
}

/** Display name for any group or subcategory slug. Falls back to the slug. */
export function categoryDisplayName(slug: string): string {
  const group = getGroup(slug);
  if (group) return group.name;
  const found = getSubcategory(slug);
  if (found) return found.subcategory.name;
  return slug;
}

/** Parent group slug for a subcategory, or null for groups/unknown. */
export function parentGroupSlug(slug: string): string | null {
  const found = getSubcategory(slug);
  return found ? found.group.slug : null;
}

export function isGroupSlug(slug: string): boolean {
  return productGroups.some((group) => group.slug === slug);
}
