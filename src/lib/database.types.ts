// Mirrors supabase/migrations. Regenerate once the local stack runs:
//   npm run db:types
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ListingStatus = 'active' | 'hidden';
export type ImportStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type SwipeDirection = 'left' | 'right';

type ProfileRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

type ListingRow = {
  id: string;
  seller_id: string;
  import_job_id: string | null;
  source_url: string | null;
  brand: string;
  model: string | null;
  reference: string | null;
  year: number | null;
  movement: string | null;
  case_size_mm: number | null;
  condition: string | null;
  has_box: boolean | null;
  has_papers: boolean | null;
  price_cents: number | null;
  currency: string;
  description: string | null;
  status: ListingStatus;
  created_at: string;
};

type ListingPhotoRow = {
  id: string;
  listing_id: string;
  url: string;
  position: number;
};

type SwipeRow = {
  id: string;
  actor_id: string;
  listing_id: string;
  direction: SwipeDirection;
  created_at: string;
};

type ImportJobRow = {
  id: string;
  user_id: string;
  source_url: string;
  provider: string;
  status: ImportStatus;
  error: string | null;
  listings_created: number;
  created_at: string;
  finished_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<Omit<ProfileRow, 'id'>> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      listings: {
        Row: ListingRow;
        Insert: Partial<Omit<ListingRow, 'id' | 'seller_id' | 'brand' | 'created_at'>> & {
          seller_id: string;
          brand: string;
        };
        Update: Partial<ListingRow>;
        Relationships: [];
      };
      listing_photos: {
        Row: ListingPhotoRow;
        Insert: Partial<Omit<ListingPhotoRow, 'id' | 'listing_id' | 'url'>> & {
          listing_id: string;
          url: string;
        };
        Update: Partial<ListingPhotoRow>;
        Relationships: [];
      };
      swipes: {
        Row: SwipeRow;
        Insert: Omit<SwipeRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<SwipeRow>;
        Relationships: [];
      };
      import_jobs: {
        Row: ImportJobRow;
        Insert: Partial<Omit<ImportJobRow, 'id' | 'user_id' | 'source_url' | 'provider'>> & {
          user_id: string;
          source_url: string;
          provider: string;
        };
        Update: Partial<ImportJobRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      get_deck: {
        Args: { p_limit?: number };
        Returns: ListingRow[];
      };
    };
    Enums: {
      listing_status: ListingStatus;
      import_status: ImportStatus;
      swipe_direction: SwipeDirection;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Listing = ListingRow;
export type ListingPhoto = ListingPhotoRow;
export type ImportJob = ImportJobRow;
export type Profile = ProfileRow;
export type DeckCard = Listing & { photos: ListingPhoto[] };
