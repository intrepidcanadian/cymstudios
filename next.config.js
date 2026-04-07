/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Stub out unused transitive dependencies from @coinbase/cdp-sdk
    // (pulled in via @wagmi/connectors → @base-org/account)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@solana/kit': false,
      '@solana/web3.js': false,
    };
    // Ignore optional peer deps that aren't installed
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
    ];
    return config;
  },
}

module.exports = nextConfig

