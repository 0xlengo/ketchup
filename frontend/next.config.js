/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Usar standalone para evitar problemas de prerenderizado
  output: 'standalone',
  // Optimizaciones
  swcMinify: true,
  // Configuración para páginas dinámicas
  trailingSlash: false,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'porto/internal': false,
      };
    }
    return config;
  },
}

module.exports = nextConfig

