import { MODELS } from "@/generation/catalog"
import { StudioTemplate } from "@/layouts/studio"

import { NoModels } from "@/components/studio/no-models"

export default function Page() {
  if (MODELS.length === 0) return <NoModels />
  return (
    <StudioTemplate
      title="Reels"
      headline="Films from the watches you imported"
    />
  )
}
