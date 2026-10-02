/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Linting is a separate CI step (`npm run lint`); never block a production build on style.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Native / CommonJS-heavy parsers must stay outside the bundler and be `require`d at runtime.
    serverComponentsExternalPackages: [
      '@napi-rs/canvas',
      'pdfjs-dist',
      'pdf-parse',
      'tesseract.js',
      'mammoth',
      'jszip',
    ],
    // tesseract.js loads worker + language data from disk at runtime.
    outputFileTracingIncludes: {
      '/api/**': ['./node_modules/tesseract.js/**', './node_modules/pdfjs-dist/legacy/build/**'],
    },
  },
};

export default nextConfig;
