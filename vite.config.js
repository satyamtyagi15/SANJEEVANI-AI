import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import 'dotenv/config'
import handler from './api/reports.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-api-reports-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/reports')) {
            // Parse query parameters
            const urlObj = new URL(req.url, 'http://localhost');
            req.query = Object.fromEntries(urlObj.searchParams.entries());

            // Collect body chunks for POST / PUT / PATCH
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                req.body = body ? JSON.parse(body) : {};
              } catch {
                req.body = {};
              }

              // Polyfill helper methods expected by Vercel serverless handler
              if (!res.status) {
                res.status = function(code) {
                  this.statusCode = code;
                  return this;
                };
              }
              if (!res.json) {
                res.json = function(data) {
                  this.setHeader('Content-Type', 'application/json');
                  this.end(JSON.stringify(data));
                  return this;
                };
              }

              try {
                await handler(req, res);
              } catch (err) {
                console.error('API Error in local dev server:', err);
                if (!res.writableEnded) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
                }
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ],
})

