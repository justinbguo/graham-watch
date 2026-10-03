import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import type { ReelListing } from "@/lib/listings"

const PHOTO_BUCKET = "listing-photos"

type PhotoRow = {
  id: string
  position: number
  source_url: string
  storage_path: string | null
}

type DealerRow = {
  name: string
  instagram: string | null
  permission: string
}

type ListingRow = {
  id: string
  brand: string
  model: string | null
  reference: string | null
  year: number | null
  price_cents: number | null
  currency: string
  dealers: DealerRow | DealerRow[] | null
  listing_photos: PhotoRow[] | null
}

function dealerOf(row: ListingRow): DealerRow | null {
  const value = row.dealers
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function photoUrl(supabaseUrl: string, photo: PhotoRow): string | null {
  if (photo.storage_path) {
    const path = photo.storage_path
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")
    return `${supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`
  }
  return photo.source_url || null
}

function priceLabel(cents: number | null, currency: string): string | null {
  if (cents == null) return null
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100)
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`
  }
}

function instagramHandle(value: string | null): string | null {
  if (!value) return null
  const handle = value
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/$/, "")
  return handle || null
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in studio/.env.local. Copy them from scripts/.env.operator.local.",
      },
      { status: 503 }
    )
  }

  // Listings are readable only by a signed-in Graham account. This tool has no
  // Graham session, so the server uses the service role and never sends it out.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, year, price_cents, currency, dealers!inner(name, instagram, permission), listing_photos(id, position, source_url, storage_path)"
    )
    .eq("status", "active")
    .eq("dealers.permission", "approved")
    .order("created_at", { ascending: false })
    .limit(48)

  if (error) {
    console.error("listings query failed", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const listings: ReelListing[] = ((data ?? []) as ListingRow[]).flatMap(
    (row) => {
      const dealer = dealerOf(row)
      if (!dealer) return []
      const photos = (row.listing_photos ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .flatMap((photo) => {
          const url = photoUrl(supabaseUrl, photo)
          return url ? [{ id: photo.id, url }] : []
        })
      return [
        {
          id: row.id,
          brand: row.brand,
          model: row.model,
          reference: row.reference,
          year: row.year,
          priceLabel: priceLabel(row.price_cents, row.currency),
          dealerName: dealer.name,
          instagram: instagramHandle(dealer.instagram),
          photos,
        },
      ]
    }
  )

  return NextResponse.json({ listings })
}
