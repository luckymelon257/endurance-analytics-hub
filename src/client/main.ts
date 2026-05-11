import './tailwind.css'
import { createElement, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { islandRegistry, type IslandName } from './islands/_registry'

/**
 * The mount runtime can't statically know each island's prop shape because the
 * registry hides them behind dynamic imports. Each island author is responsible
 * for matching the JSON contract its EJS partial sends; we treat props as opaque
 * at this seam.
 */
type LooseComponent = ComponentType<Record<string, unknown>>

function isKnownIsland(name: string): name is IslandName {
  return name in islandRegistry
}

async function mountIsland(el: HTMLElement): Promise<void> {
  const name = el.dataset.island
  if (!name || !isKnownIsland(name)) {
    console.warn(`[islands] unknown island: ${name ?? '(missing)'}`)
    return
  }
  // Each container is hydrated exactly once. HTMX swaps in fresh container
  // nodes when a section refreshes, so a "remount" is always a new container.
  if (el.dataset.islandMounted === '1') return
  el.dataset.islandMounted = '1'

  let props: Record<string, unknown> = {}
  const raw = el.dataset.props
  if (raw) {
    try {
      props = JSON.parse(raw)
    } catch (err) {
      console.error(`[islands] invalid JSON props for "${name}":`, err)
      return
    }
  }

  const { default: Component } = await islandRegistry[name]()
  createRoot(el).render(createElement(Component as unknown as LooseComponent, props))
}

function mountAllIn(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-island]').forEach((el) => {
    void mountIsland(el)
  })
}

mountAllIn(document)

// HTMX swaps in fresh HTML (e.g. after a sync); pick up any [data-island]
// nodes the new content brought with it and hydrate them.
document.body.addEventListener('htmx:afterSwap', (event) => {
  const target = (event as CustomEvent).detail?.target as ParentNode | undefined
  if (target) mountAllIn(target)
})
