import { lazy, Suspense, type ReactNode } from 'react'
import { config } from './config.ts'
import { useRoute, type Route } from './lib/router.tsx'
import { MapStageProvider } from './map/MapStage.tsx'
import { copy } from './ui/copy.ts'
import { Skeleton } from './ui/kit.tsx'
import { Shell } from './ui/Shell.tsx'
import { ToastProvider } from './ui/toast.tsx'
import NotFound from './screens/NotFound.tsx'
import TextPage from './screens/TextPage.tsx'

const GlobeScreen = lazy(() => import('./screens/GlobeScreen.tsx'))
const KitScreen = lazy(() => import('./screens/KitScreen.tsx'))

export function screenFor(r: Route): ReactNode {
  switch (r.name) {
    case 'globe':
      return <GlobeScreen />
    case 'privacy':
      return <TextPage page={copy.pages.privacy} />
    case 'limits':
      return <TextPage page={copy.pages.limits} />
    case 'kit':
      return config.testMode ? <KitScreen /> : <NotFound />
    default:
      return <NotFound />
  }
}

export function App() {
  const route = useRoute()
  return (
    <ToastProvider>
      <MapStageProvider>
        <Shell route={route}>
          <Suspense fallback={<Skeleton className="m-6 h-40" />}>{screenFor(route)}</Suspense>
        </Shell>
      </MapStageProvider>
    </ToastProvider>
  )
}
