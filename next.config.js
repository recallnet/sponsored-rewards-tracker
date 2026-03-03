/** @type {import('next').NextConfig} */
const basePath = "/pm-reward-tracker";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@arb-agent/agent"],
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

module.exports = nextConfig;
