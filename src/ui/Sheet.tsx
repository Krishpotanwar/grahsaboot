import { Drawer } from '@base-ui/react/drawer'
import type { ReactNode } from 'react'

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  children: ReactNode
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        {/* Viewport is what enables swipe-to-dismiss. */}
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end">
          <Drawer.Popup className="glass max-h-[85dvh] w-full overflow-auto overscroll-contain rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none transition-transform duration-300 ease-out-expo [transform:translateY(var(--drawer-swipe-movement-y))] data-swiping:duration-0 data-starting-style:translate-y-full data-ending-style:translate-y-full">
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-control" />
            <Drawer.Content>
              <Drawer.Title className="mb-3 text-lg font-semibold">{title}</Drawer.Title>
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
