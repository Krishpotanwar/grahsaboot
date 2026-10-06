import { useState } from 'react'
import { Button, IconButton, Panel, QualityTag, Skeleton, TextField } from '../ui/kit.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { useToast } from '../ui/toast.tsx'
import { Planet } from '@phosphor-icons/react'

export default function KitScreen() {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  return (
    <div className="mx-auto grid max-w-[1200px] gap-6 p-6">
      <h1 className="text-2xl font-semibold">Kit</h1>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete</Button>
        <IconButton label="Satellites">
          <Planet size={20} weight="bold" />
        </IconButton>
      </div>
      <TextField label="Place" help="A city or coordinates" placeholder="Nagpur" />
      <TextField
        label="Road width (metres)"
        error="Road width must be a whole number from 5 to 200 metres."
        defaultValue="4"
      />
      <Panel title="Evidence">
        <div className="flex flex-wrap gap-4">
          <QualityTag label="CLEAR" />
          <QualityTag label="PARTIAL" />
          <QualityTag label="OBSCURED" />
          <QualityTag label="NOT_COVERED" />
        </div>
      </Panel>
      <Panel title="Glass" glass>
        Floating panel
      </Panel>
      <Skeleton className="h-24 w-full" />
      <div className="flex gap-3">
        <Button onClick={() => setOpen(true)}>Open sheet</Button>
        <Button onClick={() => toast('Saved', 'Your investigation is stored.')}>Show toast</Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Sheet">
        <p className="text-fg-2">Sheet content</p>
      </Sheet>
    </div>
  )
}
