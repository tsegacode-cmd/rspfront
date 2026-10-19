import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import os from 'os'
import { resolve } from 'path'

// Auto-detect local network IP (first non-internal IPv4 address)
function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

export default defineConfig(({ mode, command }) => {
  const isProductionBuild = command === 'build'
  const isVercelBuild = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL)
  const nodeEnv = isProductionBuild ? 'production' : (process.env.NODE_ENV || mode)

  // Load .env file values; fall back to auto-detected IP if not set
  const env = loadEnv(mode, process.cwd(), '')
  const networkIP = env.VITE_NETWORK_IP || getLocalIP()
  const backendPort = env.VITE_BACKEND_PORT || '5000'
  const configuredApiUrl = (isVercelBuild ? process.env.VITE_API_URL : env.VITE_API_URL)
    ?.trim().replace(/\/+$/, '')
  const certificateFile = env.VITE_HTTPS_CERT_FILE
  const keyFile = env.VITE_HTTPS_KEY_FILE
  if (Boolean(certificateFile) !== Boolean(keyFile)) {
    throw new Error('Set both VITE_HTTPS_CERT_FILE and VITE_HTTPS_KEY_FILE to enable HTTPS.')
  }
  const isPrivateOrLocalHost = hostname => {
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === '::1') return true
    const octets = hostname.split('.').map(Number)
    if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
    return octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
  }
  let validPublicApiUrl = false
  if (isVercelBuild && configuredApiUrl) {
    try {
      const apiUrl = new URL(configuredApiUrl)
      validPublicApiUrl = apiUrl.protocol === 'https:' &&
        !isPrivateOrLocalHost(apiUrl.hostname) &&
        apiUrl.pathname.replace(/\/+$/, '').endsWith('/api/v1')
    } catch {
      validPublicApiUrl = false
    }
    if (!validPublicApiUrl) {
      console.warn('VITE_API_URL is not a public HTTPS API URL ending in /api/v1; building the frontend without backend connectivity. Set it in Vercel after deploying the backend.')
    }
  }
  const https = certificateFile && keyFile
    ? {
        cert: readFileSync(resolve(process.cwd(), certificateFile)),
        key: readFileSync(resolve(process.cwd(), keyFile))
      }
    : undefined
  const apiUrl = isVercelBuild
    ? (validPublicApiUrl ? configuredApiUrl : '')
    : https ? '/api/v1' : (configuredApiUrl || `http://${networkIP}:${backendPort}/api/v1`)

  console.log(`[vite] Network IP  : ${networkIP}`)
  console.log(`[vite] Backend API : ${apiUrl}`)
  if (https) console.log('[vite] HTTPS enabled; use the trusted HTTPS network URL for microphone/camera access.')

  return {
    plugins: [react({
      fastRefresh: false  // Disabled for stability
    })],

    server: {
      host: '0.0.0.0',     // Listen on all interfaces (local + mobile)
      port: 3001,
      strictPort: false,
      cors: true,
      allowedHosts: true,  // <-- ይህንን ጨምረናል (ለቬርሴል ሆስቶች ማስተናገጃ)
      https,
      proxy: {
        '/api/v1': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true
        }
      },
      hmr: false,              // Disable HMR to avoid WebSocket conflicts
      watch: {
        usePolling: false,
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/.git/**',
          '**/backend/**',
          '**/*.log'
        ]
      }
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2015',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            utils: ['xlsx', 'jspdf', 'html2canvas']
          }
        }
      }
    },

    esbuild: {
      jsxDev: !isProductionBuild
    },

    preview: {
      host: '0.0.0.0',
      port: 3001,
      strictPort: false,
      cors: true,
      allowedHosts: true   // <-- ለፕሪቪው ሞድም ጭምር ተፈቅዷል
    },

    define: {
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
      // Inject resolved values so the app always has the correct API URL
      'import.meta.env.VITE_NETWORK_IP': JSON.stringify(networkIP),
      'import.meta.env.VITE_BACKEND_PORT': JSON.stringify(backendPort),
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_BACKEND_CONFIGURED': JSON.stringify(!isVercelBuild || validPublicApiUrl)
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
      exclude: ['@vitejs/plugin-react']
    }
  }
})