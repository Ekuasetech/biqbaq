import type { MetadataRoute } from "next";

/**
 * Makes Biqbaq installable from the browser (Q-61): its name, icons and colours when someone
 * adds it to their home screen, and opening full screen like an app. The website itself is
 * unchanged.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Biqbaq",
    short_name: "Biqbaq",
    description: "Discover products and connect with Nigerian sellers across Canada.",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#0c2352",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
