import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/** No `npm run dev`, /c/<loja> abre o catálogo (em produção isso é feito por functions/c/[slug].ts). */
function catalogRewrite(): Plugin {
  return {
    name: 'catalog-rewrite',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && /^\/c\/[^/?#]+/.test(req.url)) req.url = '/app/index.html';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [catalogRewrite()],
  server: {
    // Para testar as APIs no dev, rode em outro terminal: npm run build && npm run preview:cf
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        login: resolve(root, 'index.html'),
        app: resolve(root, 'app/index.html'),
        conta: resolve(root, 'conta/index.html'),
        admin: resolve(root, 'admin/index.html'),
        assinatura: resolve(root, 'assinatura/index.html'),
        reset: resolve(root, 'redefinir-senha/index.html'),
      },
    },
  },
});
