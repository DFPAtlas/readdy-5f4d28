import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import AutoImport from "unplugin-auto-import/vite";

const base = process.env.BASE_PATH || "/";
const isPreview = process.env.IS_PREVIEW ? true : false;

// Resolve local service URLs from environment
const n8nInternalUrl = process.env.N8N_INTERNAL_URL || "http://localhost:5678";
const playwrightWorkerUrl = process.env.PLAYWRIGHT_WORKER_URL || "http://localhost:3100";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://192.168.1.92:11434";
const ollamaRequestTimeoutMs = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || "120000", 10);
const supabaseStudioUrl = process.env.SUPABASE_STUDIO_URL || "http://localhost:54323";
const supabaseApiUrl = process.env.VITE_PUBLIC_SUPABASE_URL || "http://localhost:54321";

export default defineConfig({
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __IS_PREVIEW__: JSON.stringify(isPreview),
    __READDY_PROJECT_ID__: JSON.stringify(process.env.PROJECT_ID || ""),
    __READDY_VERSION_ID__: JSON.stringify(process.env.VERSION_ID || ""),
    __READDY_AI_DOMAIN__: JSON.stringify(process.env.READDY_AI_DOMAIN || ""),
  },
  plugins: [
    react(),
    AutoImport({
      imports: [
        {
          react: [
            ["default", "React"],
            "useState",
            "useEffect",
            "useContext",
            "useReducer",
            "useCallback",
            "useMemo",
            "useRef",
            "useImperativeHandle",
            "useLayoutEffect",
            "useDebugValue",
            "useDeferredValue",
            "useId",
            "useInsertionEffect",
            "useSyncExternalStore",
            "useTransition",
            "startTransition",
            "lazy",
            "memo",
            "forwardRef",
            "createContext",
            "createElement",
            "cloneElement",
            "isValidElement",
          ],
        },
        {
          "react-router-dom": [
            "useNavigate",
            "useLocation",
            "useParams",
            "useSearchParams",
            "Link",
            "NavLink",
            "Navigate",
            "Outlet",
          ],
        },
        {
          "react-i18next": ["useTranslation", "Trans"],
        },
      ],
      dts: true,
    }),
  ],
  base,
  build: {
    sourcemap: true,
    outDir: 'out',
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    // Dev proxy — routes /api/uat/* to n8n webhook or API gateway
    // In production, nginx/caddy handles this instead.
    proxy: {
      "/api/uat": {
        target: n8nInternalUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/uat/, "/webhook/dfp-uat"),
        timeout: 30000,
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.warn("[vite proxy] n8n proxy error:", err.message);
          });
        },
      },
      // Health endpoints for individual services
      "/api/local/health/n8n": {
        target: n8nInternalUrl,
        changeOrigin: true,
        rewrite: () => "/healthz",
        timeout: 5000,
      },
      "/api/local/health/playwright": {
        target: playwrightWorkerUrl,
        changeOrigin: true,
        rewrite: () => "/health",
        timeout: 5000,
      },
      "/api/local/health/ollama": {
        target: ollamaBaseUrl,
        changeOrigin: true,
        rewrite: () => "/api/tags",
        timeout: 5000,
      },
      // Generic Ollama proxy — all /api/local/ollama/* routes go to Atlas-HaL
      "/api/local/ollama": {
        target: ollamaBaseUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/local\/ollama/, ""),
        timeout: ollamaRequestTimeoutMs,
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.warn("[vite proxy] Ollama proxy error:", err.message);
          });
        },
      },
      // Supabase Studio proxy (local dev only)
      "/api/local/studio": {
        target: supabaseStudioUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/local\/studio/, ""),
        timeout: 10000,
      },
      // Supabase REST API proxy (local dev only — for health checks)
      "/api/local/supabase": {
        target: supabaseApiUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/local\/supabase/, ""),
        timeout: 10000,
      },
    },
  },
});