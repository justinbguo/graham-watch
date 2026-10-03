"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { watchName, type ReelListing } from "@/lib/listings"

export function ListingPicker({
  busyId,
  onUse,
}: {
  busyId: string | null
  onUse: (listing: ReelListing) => void
}) {
  const [listings, setListings] = useState<ReelListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch("/api/listings")
      .then(async (response) => {
        const body = (await response.json()) as {
          listings?: ReelListing[]
          error?: string
        }
        if (!response.ok) throw new Error(body.error ?? "Could not load listings")
        return body.listings ?? []
      })
      .then((rows) => {
        if (!cancelled) setListings(rows)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load listings")
          setListings([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <p className="text-sm text-q-state-error-fg">{error}</p>
  }
  if (!listings) {
    return <p className="text-sm text-muted-foreground">Loading listings…</p>
  }
  if (listings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No approved listings with a photo yet. Import a shop, then come back.
      </p>
    )
  }

  return (
    <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
      {listings.map((listing) => {
        const photo = listing.photos[0]
        const busy = busyId === listing.id
        return (
          <article
            key={listing.id}
            className="flex flex-col gap-2 rounded-[20px] bg-white/5 p-2"
          >
            <div className="h-60 overflow-hidden rounded-2xl border border-white/10 bg-black">
              {photo ? (
                // Listing photos are remote shop files, not files next/image can optimize.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
                  alt={watchName(listing)}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                  No photo
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {watchName(listing)}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {listing.instagram ? `@${listing.instagram}` : listing.dealerName}
                  {listing.priceLabel ? ` · ${listing.priceLabel}` : ""}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={busyId !== null || listing.photos.length === 0}
                onClick={() => onUse(listing)}
              >
                {busy ? "Preparing…" : "Make a film"}
              </Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
