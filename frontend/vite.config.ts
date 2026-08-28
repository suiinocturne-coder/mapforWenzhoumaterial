import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // pnpm 的依赖通过符号链接组织；关闭开发期预打包可避免受限 Windows
  // 工作区扫描到上级目录，同时不影响生产构建。
  optimizeDeps: { noDiscovery: true, include: [] },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
  preview: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
});
