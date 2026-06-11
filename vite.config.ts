// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Tell the nitro build plugin to target Vercel instead of the default Cloudflare.
  // This causes Nitro to emit to .vercel/output/ (Build Output API) which Vercel picks up automatically.
  nitro: {
    preset: "vercel",
    externals: {
      external: ["@zxing/browser", "@zxing/library"],
    },
  },
  vite: {
    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      watch: {
        ignored: [
          "**/node_modules/**",
          "**/.cache/**",
          "**/.git/**",
          "**/.tanstack/**",
          "**/.vinxi/**",
          "**/.nitro/**",
        ],
      },
    },
  },
});
