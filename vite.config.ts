import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Link previews (WhatsApp, X, LinkedIn) only accept absolute image URLs.
// Netlify exposes the site's primary address as `URL` at build time.
const siteUrl = (): Plugin => ({
  name: 'sanad-site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', (process.env.URL ?? '').replace(/\/$/, '')),
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), siteUrl()],
})
