import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  environments: {
    // Un Worker se despliega como un único módulo: no puede resolver un
    // `import()` dinámico a un archivo suelto. `unpdf` carga pdf.js así, así
    // que se inlinea en el bundle para que siga siendo lazy (sólo se evalúa
    // al importar un PDF) sin romper el runtime de Cloudflare.
    hlcs_desayuno: {
      build: {
        rollupOptions: {
          output: { inlineDynamicImports: true },
        },
      },
    },
  },
  server: {
    watch: {
      ignored: ["**/.wrangler/**"],
    },
  },
});
