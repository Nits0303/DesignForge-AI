/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Prevents `url(...)` rewriting that can emit `url(...)` placeholders; Next's bundler
    // then tries to resolve `...` as a module (Module not found: Can't resolve '...').
    "@tailwindcss/postcss": {
      transformAssetUrls: false,
    },
  },
};

export default config;

