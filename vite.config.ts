import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // Optimize chunk splitting for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': [
            '@visx/curve',
            '@visx/event',
            '@visx/grid',
            '@visx/responsive',
            '@visx/scale',
            '@visx/shape',
            'd3-array',
            'd3-shape',
            'motion',
          ],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-select',
            '@radix-ui/react-accordion',
          ],
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Use esbuild for faster minification (default, no extra dependency needed)
    minify: 'esbuild',
  },
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api/yahoo-chart": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api\/yahoo-chart/, ""),
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', '@visx/responsive', '@visx/scale', 'motion'],
  },
}));
