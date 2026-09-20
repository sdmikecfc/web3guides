/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolated local game previews can coexist with the site's usual dev build.
  distDir: process.env.DK_PREVIEW_DIST || '.next',
  webpack(config) {
    // MetaMask's shared SDK retains an optional React Native storage import.
    // Its browser path uses localStorage; this site never uses the native path.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage$': false,
    }
    return config
  },
}

module.exports = nextConfig
