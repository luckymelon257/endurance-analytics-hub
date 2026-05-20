import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { readFileSync } from 'fs'
import { join } from 'path'
import { IS_PRODUCTION } from '../config/env'

interface ManifestEntry {
  file: string
  src?: string
  isEntry?: boolean
  css?: string[]
  imports?: string[]
}

type ViteManifest = Record<string, ManifestEntry>

const VITE_DEV_URL = 'http://localhost:5173'
const CLIENT_ENTRY = 'src/client/main.ts'
const MANIFEST_PATH = join(process.cwd(), 'public', 'dist', '.vite', 'manifest.json')

@Injectable()
export class ViteAssetsService implements OnModuleInit {
  private readonly logger = new Logger(ViteAssetsService.name)
  private manifest: ViteManifest = {}

  public onModuleInit(): void {
    if (!IS_PRODUCTION) return
    try {
      this.manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ViteManifest
    } catch {
      this.logger.warn(
        `Vite manifest not found at ${MANIFEST_PATH}. Run \`npm run build:client\`.`,
      )
    }
  }

  /**
   * HTML to inject into <head> so the browser loads the client bundle. In dev
   * this points at the Vite dev server (HMR + React Refresh). In prod it
   * resolves the hashed asset filenames from manifest.json.
   */
  public headHtml(): string {
    if (!IS_PRODUCTION) {
      // React Refresh shim must run BEFORE any module that imports React.
      return [
        `<script type="module">`,
        `  import RefreshRuntime from "${VITE_DEV_URL}/@react-refresh"`,
        `  RefreshRuntime.injectIntoGlobalHook(window)`,
        `  window.$RefreshReg$ = () => {}`,
        `  window.$RefreshSig$ = () => (type) => type`,
        `  window.__vite_plugin_react_preamble_installed__ = true`,
        `</script>`,
        `<script type="module" src="${VITE_DEV_URL}/@vite/client"></script>`,
        `<script type="module" src="${VITE_DEV_URL}/${CLIENT_ENTRY}"></script>`,
      ].join('\n')
    }

    const entry = this.manifest[CLIENT_ENTRY]
    if (!entry) return ''

    const cssLinks = (entry.css ?? [])
      .map((c) => `<link rel="stylesheet" href="/dist/${c}">`)
      .join('\n')
    return `${cssLinks}\n<script type="module" src="/dist/${entry.file}"></script>`
  }
}
