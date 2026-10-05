/**
 * Navigation content that will eventually come from the API/database.
 * Centralised here so header, mobile drawer and search suggestions share
 * one source until the backend owns it.
 */

/** Marketplace-popular searches shown in the search dropdown. */
export const popularSearches: string[] = [
  "Republic Day",
  "Vasant Panchami",
  "Maha Shivratri",
  "Ganesh Chaturthi",
  "Logo Templates",
  "Banner Designs",
];

/** How many primary-nav categories render before the "More" menu. */
export const PRIMARY_NAV_VISIBLE_COUNT = 8;

/** Local-storage key for recent searches (UI-only, never synced). */
export const RECENT_SEARCHES_KEY = "ch-recent-searches";
export const RECENT_SEARCHES_LIMIT = 5;

/**
 * Browsing links captured from the current live desktop and mobile menus.
 * The union preserves menu-only destinations from both breakpoints while
 * keeping the live desktop order. Category destinations use storefront routes.
 */
export const productNavigation = [
  {
    label: "Vector Creatives",
    slug: "vector-creatives",
    children: [
      { label: "Flyers", slug: "flyers" },
      { label: "Logo Design", slug: "logo-design" },
      { label: "Social Media", slug: "social-media" },
      { label: "Website", slug: "website" },
      { label: "T-Shirts", slug: "t-shirts" },
      { label: "Skylines", slug: "skylines" },
    ],
  },
  {
    label: "Character Bundle",
    slug: "character-bundle",
    children: [
      { label: "Cultural", slug: "cultural" },
      { label: "Festival & Events", slug: "festival-events" },
      { label: "Mythological", slug: "mythological" },
      { label: "People", slug: "people" },
      { label: "Profession", slug: "profession" },
      { label: "Miscellaneous", slug: "miscellaneous" },
    ],
  },
  {
    label: "Freebies",
    slug: "freebies",
    children: [
      { label: "Actors", slug: "actors" },
      { label: "Actress", slug: "actress" },
      { label: "Business Person", slug: "business-person" },
      { label: "Politician", slug: "politician" },
      { label: "Singers", slug: "singers" },
      { label: "Spiritual Mentor", slug: "spiritual-mentor" },
      { label: "Sports", slug: "sports" },
      { label: "Youtuber", slug: "youtuber" },
      { label: "Miscellaneous", slug: "freebies-miscellaneous" },
    ],
  },
  { label: "Characters", slug: "illustrations", children: [] },
  { label: "Collections", href: routes.collections(), children: [] },
  { label: "NFT’s", slug: "nfts", children: [] },
] as const;
import { routes } from "@/lib/routes";
