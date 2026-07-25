/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdf.js references an optional native `canvas` module (Node-only). It's not
    // needed for text extraction in the browser, so stub it out to avoid
    // "Module not found: canvas" during the client build.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
