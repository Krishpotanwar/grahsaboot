import type { Dispatch, SetStateAction } from 'react'
import { flyToPlace } from '../map/camera.ts'
import { useMapStage } from '../map/MapStage.tsx'
import { nameForPlace, type Draft } from './draft.ts'
import { copy } from '../ui/copy.ts'
import { flow } from '../ui/copy-flow.ts'
import { Button } from '../ui/kit.tsx'
import { SearchBox } from '../ui/SearchBox.tsx'

export type StepProps = {
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft>>
  onBack(): void
  onNext(): void
}

export function PlaceStep({ draft, setDraft, onNext }: StepProps) {
  const { map } = useMapStage()
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.04em]">{flow.place.title}</h1>
      <SearchBox
        onSelect={(p) => {
          setDraft((d) => ({ ...d, place: p, name: nameForPlace(d, p) }))
          if (map)
            flyToPlace(map, { ...p, bbox: null }, matchMedia('(prefers-reduced-motion: reduce)').matches)
        }}
      />
      <p className="text-sm text-fg-2" aria-live="polite">
        {draft.place ? flow.place.chosen(draft.place.name) : flow.place.need}
      </p>
      <div className="flex justify-end">
        <Button variant="primary" disabled={!draft.place} onClick={onNext}>
          {copy.common.next}
        </Button>
      </div>
    </div>
  )
}
