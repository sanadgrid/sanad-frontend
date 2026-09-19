import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The release number shown on the site. It is the count of commits on the
// deployed branch, so every push bumps it with nobody editing a file. A shallow
// clone cannot count history, so the build time stands in for it there.
function appVersion() {
  const git = (args: string) => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  const built = new Date()
  try {
    if (git('rev-parse --is-shallow-repository') === 'false')
      return { number: `1.${git('rev-list --count HEAD')}`, commit: git('rev-parse --short HEAD'), built }
  } catch {
    // no git in this environment — fall through to the time-based number
  }
  const stamp = built.toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '.')
  return { number: `1.${stamp}`, commit: (process.env.COMMIT_REF ?? '').slice(0, 7), built }
}

const version = appVersion()

// Link previews (WhatsApp, X, LinkedIn) only accept absolute image URLs.
// Netlify exposes the site's primary address as `URL` at build time.
const siteUrl = (): Plugin => ({
  name: 'sanad-site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', (process.env.URL ?? '').replace(/\/$/, '')),
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), siteUrl()],
  define: {
    __APP_VERSION__: JSON.stringify(version.number),
    __APP_COMMIT__: JSON.stringify(version.commit),
    __APP_BUILT__: JSON.stringify(version.built.toISOString()),
  },
  build: {
    rolldownOptions: {
      output: {
        // The dashboard's heavy libraries get their own long-lived chunks, so an
        // edit to the page does not make visitors download Firestore and Leaflet again.
        codeSplitting: {
          groups: [
            { name: 'firestore', test: /node_modules[\\/]@firebase[\\/]firestore/ },
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'leaflet', test: /node_modules[\\/]leaflet/ },
          ],
        },
      },
    },
  },
})
