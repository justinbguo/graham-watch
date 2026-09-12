// Mirrors supabase/migrations. Regenerate once a database exists:
//   npm run db:types
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type DealerPermission = 'pending' | 'approved' | 'revoked';
export type ListingStatus = 'active' | 'hidden';
export type ImportStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type SwipeDirection = 'left' | 'right';
export type InquiryStatus = 'pending' | 'sent' | 'failed';

type ProfileRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

type DealerRow = {
  id: string;
  name: string;
  website: string | null;
  contact_email: string | null;
  permission: DealerPermission;
  claimed_by: string | null;
  created_by: string;
  created_at: string;
};

type ListingRow = {
  id: string;
  dealer_id: string;
  imported_by: string;
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
  dealer_id: string | null;
  source_url: string;
  provider: string;
  status: ImportStatus;
  error: string | null;
  listings_created: number;
  created_at: string;
  finished_at: string | null;
};

type InquiryRow = {
  id: string;
  listing_id: string;
  dealer_id: string;
  buyer_id: string;
  message: string | null;
  status: InquiryStatus;
  created_at: string;
  sent_at: string | null;
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
      dealers: {
        Row: DealerRow;
        Insert: Partial<Omit<DealerRow, 'id' | 'name' | 'created_by'>> & {
          name: string;
          created_by: string;
        };
        Update: Partial<DealerRow>;
        Relationships: [];
      };
      listings: {
        Row: ListingRow;
        Insert: Partial<
          Omit<ListingRow, 'id' | 'dealer_id' | 'imported_by' | 'brand' | 'created_at'>
        > & {
          dealer_id: string;
          imported_by: string;
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
      inquiries: {
        Row: InquiryRow;
        Insert: Partial<Omit<InquiryRow, 'id' | 'listing_id' | 'dealer_id' | 'buyer_id'>> & {
          listing_id: string;
          dealer_id: string;
          buyer_id: string;
        };
        Update: Partial<InquiryRow>;
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
      dealer_permission: DealerPermission;
      listing_status: ListingStatus;
      import_status: ImportStatus;
      swipe_direction: SwipeDirection;
      inquiry_status: InquiryStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Profile = ProfileRow;
export type Dealer = DealerRow;
export type Listing = ListingRow;
export type ListingPhoto = ListingPhotoRow;
export type ImportJob = ImportJobRow;
export type Inquiry = InquiryRow;

/** A listing with everything a card needs to render in one object. */
export type DeckCard = Listing & {
  photos: ListingPhoto[];
  dealer: Pick<Dealer, 'id' | 'name' | 'website'> | null;
};
