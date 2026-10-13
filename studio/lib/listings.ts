export type ReelPhoto = {
  id: string
  url: string
}

export type ReelListing = {
  id: string
  brand: string
  model: string | null
  reference: string | null
  year: number | null
  priceLabel: string | null
  dealerName: string
  /** Instagram handle without @, when the shop published one. */
  instagram: string | null
  photos: ReelPhoto[]
}

export function watchName(listing: ReelListing): string {
  return [listing.brand, listing.model].filter(Boolean).join(" ")
}

/** Prompt for Seedance. The photo is the subject; the words only describe the move. */
export function cinematicPrompt(listing: ReelListing): string {
  const name = watchName(listing)
  const reference = listing.reference ? `, reference ${listing.reference}` : ""
  return `Cinematic product film of this ${name}${reference}. Slow push-in on a dark stone surface, soft rim light, shallow depth of field. The watch stays identical to the photograph. No text, no extra logos.`
}

/** Caption for the social post. The handle is what you tag. */
export function postCaption(listing: ReelListing): string {
  const title = [watchName(listing), listing.reference].filter(Boolean).join(" · ")
  const lines = [title]
  if (listing.priceLabel) lines.push(listing.priceLabel)
  lines.push("")
  lines.push(listing.instagram ? `@${listing.instagram}` : listing.dealerName)
  return lines.join("\n")
}
