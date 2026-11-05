// Public assets must follow Vite's base path on GitHub Pages.
export function assetUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}
