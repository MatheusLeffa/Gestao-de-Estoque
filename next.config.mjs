/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite um segundo `next dev` na mesma pasta sem disputar o `.next` (ex.: preview do Claude).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
