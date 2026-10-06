import { Toast } from '@base-ui/react/toast'
import { X } from '@phosphor-icons/react'
import { useCallback, type ReactNode } from 'react'
import { copy } from './copy.ts'

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((t) => (
    <Toast.Root key={t.id} toast={t} className="glass relative grid gap-1 p-3 pr-12">
      <Toast.Title className="font-medium text-fg" />
      <Toast.Description className="text-sm text-fg-2" />
      <Toast.Close
        aria-label={copy.common.close}
        className="absolute right-0.5 top-0.5 grid h-11 w-11 place-items-center text-fg-2"
      >
        <X size={16} weight="bold" />
      </Toast.Close>
    </Toast.Root>
  ))
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={5000}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 right-4 z-50 grid w-[min(92vw,380px)] gap-2">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

export function useToast(): (title: string, description?: string) => void {
  const { add } = Toast.useToastManager()
  return useCallback(
    (title: string, description?: string) => {
      add({ title, description })
    },
    [add],
  )
}
