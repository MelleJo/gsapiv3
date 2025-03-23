const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Add alias for '@' to point to the src directory
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    // Retain existing fallbacks for Node modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  // Ensure CSS processing is enabled
  reactStrictMode: true,
  
  // Instead of using the 'api' property (which is causing errors),
  // we'll use serverRuntimeConfig if needed for API configurations
  serverRuntimeConfig: {
    // Will only be available on the server side
    bodyParserConfig: {
      sizeLimit: '100mb',
    },
  },
  
  // Add appropriate headers for FFMPEG WASM
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          }
        ],
      },
      {
        // Add cache control for FFmpeg files
        source: '/ffmpeg/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          }
        ],
      }
    ];
  },
};

module.exports = nextConfig;