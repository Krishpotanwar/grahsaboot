import { useEffect, useRef, useState } from 'react'
import { summarizeAoi } from '../geo/aoi.ts'
import { useSearchParams } from '../lib/router.tsx'
import { accentColor, fitAoi, removeAoiLayer, setAoiLayer } from '../map/aoiLayer.ts'
import { useMapLayout, useMapStage } from '../map/MapStage.tsx'
import { draftFromParams, draftToAoi } from '../new/draft.ts'
import { OutlineStep } from '../new/OutlineStep.tsx'
import { PlaceStep, type StepProps } from '../new/PlaceStep.tsx'
import { Stepper } from '../new/Stepper.tsx'

export default function NewInvestigation() {
  const params = useSearchParams()
  const [{ draft: initial, step: firstStep }] = useState(() => draftFromParams(params))
  const [draft, setDraft] = useState(initial)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(firstStep)
  useMapLayout('side')
  const { map, tier, installLayers } = useMapStage()
  const aoi = draftToAoi(draft)
  const section = useRef<HTMLElement>(null)
  const shownStep = useRef(step)

  useEffect(
    () =>
      map
        ? installLayers('aoi', (m) => setAoiLayer(m, draftToAoi(draft), accentColor()), removeAoiLayer)
        : undefined,
    [map, installLayers, draft],
  )
  useEffect(() => {
    if (!map || step < 3 || !aoi) return
    const r = summarizeAoi(aoi)
    if (r.ok) fitAoi(map, r.summary.bbox, matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [map, step]) // eslint-disable-line react-hooks/exhaustive-deps
  // WCAG 2.4.3: the button that changed the step unmounts with it, so focus would fall to <body>. Move it to the new step's heading (a heading takes programmatic focus only with a tabindex).
  useEffect(() => {
    const h1 = shownStep.current !== step ? section.current?.querySelector('h1') : null
    if (h1) {
      h1.tabIndex = -1
      h1.focus()
    }
    shownStep.current = step
  }, [step])

  const props = {
    draft,
    setDraft,
    onBack: () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s)),
    onNext: () => setStep((s) => (s < 4 ? ((s + 1) as 2 | 3 | 4) : s)),
  }
  return (
    <div className="grid min-h-[calc(100dvh-64px)] lg:grid-cols-[45%_1fr]">
      {/* Under the map band on a phone; with no map (tier 0) there is no band to clear. */}
      <section
        ref={section}
        className={`pointer-events-auto relative z-10 bg-bg p-6 lg:mt-0 lg:p-10 ${tier > 0 ? 'mt-[calc(50dvh-64px)]' : ''}`}
      >
        <Stepper step={step} />
        {step === 1 && <PlaceStep {...props} />}
        {step === 2 && <OutlineStep {...props} />}
        {step === 3 && <DatesStep {...props} />}
        {step === 4 && <ReviewStep {...props} />}
      </section>
      <div aria-hidden className="hidden lg:block" />
    </div>
  )
}

// Placeholders until C3 adds the dates and review steps.
const DatesStep = (_: StepProps) => null
const ReviewStep = (_: StepProps) => null
