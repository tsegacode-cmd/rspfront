import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stable configuration with minimal reloading
export default defineConfig({
  plugins: [react({
    fastRefresh: false // Disable fast refresh completely
  })],
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: false,
    cors: true,
    hmr: false, // Completely disable HMR to prevent reloading
    watch: {
      usePolling: false,
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/backend/**',
        '**/*.log',
        '**/.env*'
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
  preview: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: false,
    cors: true
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'import.meta.env.VITE_NETWORK_IP': JSON.stringify('192.168.98.195'),
    'import.meta.env.VITE_BACKEND_PORT': JSON.stringify('5000'),
    'import.meta.env.VITE_API_URL': JSON.stringify('http://192.168.98.195:5000/api/v1')
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  }
})