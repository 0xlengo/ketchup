/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Usar standalone para evitar problemas de prerenderizado
  output: 'standalone',
  // Optimizaciones
  swcMinify: true,
  // Configuración para páginas dinámicas
  trailingSlash: false,
}

module.exports = nextConfig

