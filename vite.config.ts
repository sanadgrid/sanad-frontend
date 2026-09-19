import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

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

// TEST ONLY — see features/restoration/RestorationGate.tsx. Decided here, at build
// time, so that a build holding the project's keys does not merely ignore
// `VITE_E2E_OPEN`: the code it would switch on is not in that build at all.
function e2eOpen(mode: string) {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const hasKeys = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID)
  return env.VITE_E2E_OPEN === '1' && !hasKeys
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteUrl()],
  define: {
    __E2E_OPEN__: JSON.stringify(e2eOpen(mode)),
    __APP_VERSION__: JSON.stringify(version.number),
    __APP_COMMIT__: JSON.stringify(version.commit),
    __APP_BUILT__: JSON.stringify(version.built.toISOString()),
  },
  build: {
    rolldownOptions: {
      output: {
        // The dashboard's heavy libraries get their own long-lived chunks, so an
        // edit to the page does not make its users download Firestore and Leaflet
        // again. The `firebase` chunk is all the sign-in screen loads: it claims
        // the shared core first (a group also takes what its modules depend on),
        // so the database client stays out of what a signed-out visitor downloads.
        codeSplitting: {
          groups: [
            { name: 'firebase', priority: 2, test: /node_modules[\\/](@firebase[\\/](app|auth|util|component|logger)|firebase[\\/](app|auth)|idb)[\\/]/ },
            { name: 'firestore', priority: 1, test: /node_modules[\\/](@firebase[\\/](firestore|webchannel-wrapper)|firebase[\\/]firestore)[\\/]/ },
            { name: 'leaflet', test: /node_modules[\\/]leaflet/ },
          ],
        },
      },
    },
  },
}))
