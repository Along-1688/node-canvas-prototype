/**
 * Resolves files from Vite's public directory for both local development and
 * GitHub Pages, where the app is served below the repository name.
 */
export function mediaAsset(filename: string) {
  return `${import.meta.env.BASE_URL}assets/${filename}`
}
