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
  }
};

module.exports = nextConfig;
