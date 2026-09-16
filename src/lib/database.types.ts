export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      dealer_applications: {
        Row: {
          brands: string[]
          created_at: string
          dealer_id: string | null
          id: string
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shop_name: string
          status: Database["public"]["Enums"]["application_status"]
          user_id: string
          verified_at: string | null
          verified_email: string | null
          volume: Database["public"]["Enums"]["listing_volume"]
          website: string
        }
        Insert: {
          brands?: string[]
          created_at?: string
          dealer_id?: string | null
          id?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_name: string
          status?: Database["public"]["Enums"]["application_status"]
          user_id: string
          verified_at?: string | null
          verified_email?: string | null
          volume: Database["public"]["Enums"]["listing_volume"]
          website: string
        }
        Update: {
          brands?: string[]
          created_at?: string
          dealer_id?: string | null
          id?: string
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_name?: string
          status?: Database["public"]["Enums"]["application_status"]
          user_id?: string
          verified_at?: string | null
          verified_email?: string | null
          volume?: Database["public"]["Enums"]["listing_volume"]
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_applications_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_claim_codes: {
        Row: {
          application_id: string | null
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          dealer_id: string | null
          email: string
          expires_at: string
          id: string
          requested_by: string
          salt: string
        }
        Insert: {
          application_id?: string | null
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          dealer_id?: string | null
          email: string
          expires_at: string
          id?: string
          requested_by: string
          salt?: string
        }
        Update: {
          application_id?: string | null
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          dealer_id?: string | null
          email?: string
          expires_at?: string
          id?: string
          requested_by?: string
          salt?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_claim_codes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "dealer_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_claim_codes_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_claim_codes_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dealers: {
        Row: {
          claimed_by: string | null
          contact_email: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          permission: Database["public"]["Enums"]["dealer_permission"]
          website: string | null
        }
        Insert: {
          claimed_by?: string | null
          contact_email?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          permission?: Database["public"]["Enums"]["dealer_permission"]
          website?: string | null
        }
        Update: {
          claimed_by?: string | null
          contact_email?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          permission?: Database["public"]["Enums"]["dealer_permission"]
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealers_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          dealer_id: string | null
          error: string | null
          finished_at: string | null
          id: string
          listings_created: number
          provider: string
          source_url: string
          status: Database["public"]["Enums"]["import_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          dealer_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          listings_created?: number
          provider: string
          source_url: string
          status?: Database["public"]["Enums"]["import_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          listings_created?: number
          provider?: string
          source_url?: string
          status?: Database["public"]["Enums"]["import_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          buyer_id: string
          created_at: string
          dealer_id: string
          id: string
          listing_id: string
          message: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
        }
        Insert: {
          buyer_id: string
          created_at?: string
          dealer_id: string
          id?: string
          listing_id: string
          message?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Update: {
          buyer_id?: string
          created_at?: string
          dealer_id?: string
          id?: string
          listing_id?: string
          message?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photos: {
        Row: {
          id: string
          listing_id: string
          position: number
          source_url: string
          storage_path: string | null
        }
        Insert: {
          id?: string
          listing_id: string
          position?: number
          source_url: string
          storage_path?: string | null
        }
        Update: {
          id?: string
          listing_id?: string
          position?: number
          source_url?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          availability_checked_at: string | null
          brand: string
          brand_key: string | null
          caliber: string | null
          case_material: Database["public"]["Enums"]["case_material"] | null
          case_size_mm: number | null
          complications: Database["public"]["Enums"]["complication"][]
          condition: string | null
          created_at: string
          currency: string
          dealer_id: string
          description: string | null
          dial_color: Database["public"]["Enums"]["dial_color"] | null
          edited_fields: string[]
          has_box: boolean | null
          has_papers: boolean | null
          id: string
          import_job_id: string | null
          imported_by: string
          model: string | null
          price_cents: number | null
          reference: string | null
          sold_at: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["listing_status"]
          style: Database["public"]["Enums"]["watch_style"] | null
          winding: Database["public"]["Enums"]["winding"] | null
          year: number | null
        }
        Insert: {
          availability_checked_at?: string | null
          brand: string
          brand_key?: string | null
          caliber?: string | null
          case_material?: Database["public"]["Enums"]["case_material"] | null
          case_size_mm?: number | null
          complications?: Database["public"]["Enums"]["complication"][]
          condition?: string | null
          created_at?: string
          currency?: string
          dealer_id: string
          description?: string | null
          dial_color?: Database["public"]["Enums"]["dial_color"] | null
          edited_fields?: string[]
          has_box?: boolean | null
          has_papers?: boolean | null
          id?: string
          import_job_id?: string | null
          imported_by: string
          model?: string | null
          price_cents?: number | null
          reference?: string | null
          sold_at?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          style?: Database["public"]["Enums"]["watch_style"] | null
          winding?: Database["public"]["Enums"]["winding"] | null
          year?: number | null
        }
        Update: {
          availability_checked_at?: string | null
          brand?: string
          brand_key?: string | null
          caliber?: string | null
          case_material?: Database["public"]["Enums"]["case_material"] | null
          case_size_mm?: number | null
          complications?: Database["public"]["Enums"]["complication"][]
          condition?: string | null
          created_at?: string
          currency?: string
          dealer_id?: string
          description?: string | null
          dial_color?: Database["public"]["Enums"]["dial_color"] | null
          edited_fields?: string[]
          has_box?: boolean | null
          has_papers?: boolean | null
          id?: string
          import_job_id?: string | null
          imported_by?: string
          model?: string | null
          price_cents?: number | null
          reference?: string | null
          sold_at?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          style?: Database["public"]["Enums"]["watch_style"] | null
          winding?: Database["public"]["Enums"]["winding"] | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          added_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          favorite_brands: string[]
          first_name: string | null
          handle: string | null
          id: string
          last_name: string | null
          onboarded_at: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          favorite_brands?: string[]
          first_name?: string | null
          handle?: string | null
          id: string
          last_name?: string | null
          onboarded_at?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          favorite_brands?: string[]
          first_name?: string | null
          handle?: string | null
          id?: string
          last_name?: string | null
          onboarded_at?: string | null
        }
        Relationships: []
      }
      source_items: {
        Row: {
          applied_hash: string | null
          available: boolean
          content_hash: string
          dealer_id: string
          error: string | null
          external_id: string
          extracted: Json | null
          extracted_hash: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          listing_id: string | null
          photos_hash: string | null
          provider: string
          publish: boolean
          raw: Json
          source_url: string
          text_hash: string
        }
        Insert: {
          applied_hash?: string | null
          available?: boolean
          content_hash: string
          dealer_id: string
          error?: string | null
          external_id: string
          extracted?: Json | null
          extracted_hash?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          listing_id?: string | null
          photos_hash?: string | null
          provider: string
          publish?: boolean
          raw: Json
          source_url: string
          text_hash: string
        }
        Update: {
          applied_hash?: string | null
          available?: boolean
          content_hash?: string
          dealer_id?: string
          error?: string | null
          external_id?: string
          extracted?: Json | null
          extracted_hash?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          listing_id?: string | null
          photos_hash?: string | null
          provider?: string
          publish?: boolean
          raw?: Json
          source_url?: string
          text_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_items_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      swipes: {
        Row: {
          actor_id: string
          created_at: string
          direction: Database["public"]["Enums"]["swipe_direction"]
          id: string
          listing_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["swipe_direction"]
          id?: string
          listing_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["swipe_direction"]
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adopt_existing_listings: {
        Args: { p_dealer_id: string }
        Returns: number
      }
      apply_source_item: { Args: { p_source_item_id: string }; Returns: string }
      approve_dealer_application: {
        Args: {
          p_application_id: string
          p_created_by?: string
          p_permission?: Database["public"]["Enums"]["dealer_permission"]
        }
        Returns: string
      }
      brand_key: { Args: { p_brand: string }; Returns: string }
      can_claim_with_email: {
        Args: { p_dealer_id: string; p_email: string }
        Returns: boolean
      }
      can_verify_application: {
        Args: { p_application_id: string; p_email: string }
        Returns: boolean
      }
      claim_code_digest: {
        Args: { p_code: string; p_salt: string }
        Returns: string
      }
      claim_code_limits: {
        Args: never
        Returns: {
          max_attempts: number
          max_live: number
          ttl: string
        }[]
      }
      claim_dealer: { Args: { p_dealer_id: string }; Returns: string }
      claim_dealer_with_code: {
        Args: { p_code: string; p_dealer_id: string }
        Returns: string
      }
      dealer_accounts: {
        Args: never
        Returns: {
          claimed: boolean
          id: string
          name: string
          permission: Database["public"]["Enums"]["dealer_permission"]
          website: string
        }[]
      }
      dealer_claim_host: { Args: { p_website: string }; Returns: string }
      dealer_reputation: {
        Args: { p_dealer_id: string }
        Returns: {
          joined_at: string
          last_refreshed_at: string
          listings_live: number
          watches_sold: number
        }[]
      }
      dealer_stats: {
        Args: { p_dealer_id: string }
        Returns: {
          brand: string
          inquiries: number
          listing_id: string
          model: string
          passes: number
          price_cents: number
          saves: number
        }[]
      }
      decline_dealer_application: {
        Args: {
          p_application_id: string
          p_note: string
          p_reviewed_by?: string
        }
        Returns: undefined
      }
      get_deck: {
        Args: { p_limit?: number }
        Returns: {
          availability_checked_at: string | null
          brand: string
          brand_key: string | null
          caliber: string | null
          case_material: Database["public"]["Enums"]["case_material"] | null
          case_size_mm: number | null
          complications: Database["public"]["Enums"]["complication"][]
          condition: string | null
          created_at: string
          currency: string
          dealer_id: string
          description: string | null
          dial_color: Database["public"]["Enums"]["dial_color"] | null
          edited_fields: string[]
          has_box: boolean | null
          has_papers: boolean | null
          id: string
          import_job_id: string | null
          imported_by: string
          model: string | null
          price_cents: number | null
          reference: string | null
          sold_at: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["listing_status"]
          style: Database["public"]["Enums"]["watch_style"] | null
          winding: Database["public"]["Enums"]["winding"] | null
          year: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_operator: { Args: never; Returns: boolean }
      keep_edit: {
        Args: {
          p_column: string
          p_current: unknown
          p_edited: string[]
          p_incoming: unknown
        }
        Returns: unknown
      }
      listing_facets: {
        Args: never
        Returns: {
          count: number
          kind: string
          label: string
          value: string
        }[]
      }
      lookup_claimable_dealer: {
        Args: { p_website: string }
        Returns: {
          claim_host: string
          claimed: boolean
          contact_hint: string
          id: string
          name: string
          website: string
        }[]
      }
      my_dealer_application: {
        Args: never
        Returns: {
          brands: string[]
          claim_host: string
          created_at: string
          dealer_id: string
          id: string
          note: string
          reviewed_at: string
          shop_name: string
          status: Database["public"]["Enums"]["application_status"]
          verified_at: string
          verified_email: string
          volume: Database["public"]["Enums"]["listing_volume"]
          website: string
        }[]
      }
      pending_source_item_count: {
        Args: { p_dealer_id: string }
        Returns: {
          failed: number
          pending: number
        }[]
      }
      pending_source_items: {
        Args: { p_dealer_id: string; p_limit?: number }
        Returns: {
          applied_hash: string | null
          available: boolean
          content_hash: string
          dealer_id: string
          error: string | null
          external_id: string
          extracted: Json | null
          extracted_hash: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          listing_id: string | null
          photos_hash: string | null
          provider: string
          publish: boolean
          raw: Json
          source_url: string
          text_hash: string
        }[]
        SetofOptions: {
          from: "*"
          to: "source_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      replace_listing_photos: {
        Args: { p_listing_id: string; p_photos: Json }
        Returns: number
      }
      require_operator: { Args: never; Returns: undefined }
      search_listings: {
        Args: {
          p_brands?: string[]
          p_complications?: Database["public"]["Enums"]["complication"][]
          p_dealers?: string[]
          p_exclude_swiped?: boolean
          p_favorites_first?: boolean
          p_limit?: number
          p_materials?: Database["public"]["Enums"]["case_material"][]
          p_offset?: number
          p_price_max?: number
          p_price_min?: number
          p_query?: string
          p_size_max?: number
          p_size_min?: number
          p_sort?: string
          p_styles?: Database["public"]["Enums"]["watch_style"][]
          p_windings?: Database["public"]["Enums"]["winding"][]
          p_year_max?: number
          p_year_min?: number
        }
        Returns: {
          availability_checked_at: string | null
          brand: string
          brand_key: string | null
          caliber: string | null
          case_material: Database["public"]["Enums"]["case_material"] | null
          case_size_mm: number | null
          complications: Database["public"]["Enums"]["complication"][]
          condition: string | null
          created_at: string
          currency: string
          dealer_id: string
          description: string | null
          dial_color: Database["public"]["Enums"]["dial_color"] | null
          edited_fields: string[]
          has_box: boolean | null
          has_papers: boolean | null
          id: string
          import_job_id: string | null
          imported_by: string
          model: string | null
          price_cents: number | null
          reference: string | null
          sold_at: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["listing_status"]
          style: Database["public"]["Enums"]["watch_style"] | null
          winding: Database["public"]["Enums"]["winding"] | null
          year: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_dealer_permission: {
        Args: {
          p_dealer_id: string
          p_permission: Database["public"]["Enums"]["dealer_permission"]
        }
        Returns: Database["public"]["Enums"]["dealer_permission"]
      }
      store_application_claim_code: {
        Args: {
          p_application_id: string
          p_code: string
          p_email: string
          p_requested_by: string
        }
        Returns: string
      }
      store_dealer_claim_code: {
        Args: {
          p_code: string
          p_dealer_id: string
          p_email: string
          p_requested_by: string
        }
        Returns: string
      }
      sync_source_availability: {
        Args: { p_dealer_id: string; p_seen_ids: string[] }
        Returns: number
      }
      synced_listing_columns: { Args: never; Returns: string[] }
      url_path: { Args: { p_url: string }; Returns: string }
      verify_application_email: {
        Args: { p_application_id: string; p_code: string }
        Returns: string
      }
    }
    Enums: {
      account_type: "buyer" | "dealer"
      application_status: "pending" | "approved" | "declined"
      case_material:
        | "steel"
        | "yellow_gold"
        | "rose_gold"
        | "white_gold"
        | "platinum"
        | "two_tone"
        | "titanium"
        | "bronze"
        | "silver"
        | "other"
      complication:
        | "chronograph"
        | "date"
        | "day_date"
        | "triple_calendar"
        | "annual_calendar"
        | "perpetual_calendar"
        | "moonphase"
        | "gmt"
        | "world_time"
        | "alarm"
        | "power_reserve"
        | "tourbillon"
        | "minute_repeater"
        | "jump_hour"
        | "skeleton"
      dealer_permission: "pending" | "approved" | "revoked"
      dial_color:
        | "black"
        | "white"
        | "silver"
        | "champagne"
        | "gilt"
        | "blue"
        | "green"
        | "grey"
        | "salmon"
        | "brown"
        | "cream"
        | "other"
      import_status: "queued" | "running" | "succeeded" | "failed"
      inquiry_status: "pending" | "sent" | "failed"
      listing_status: "active" | "hidden"
      listing_volume: "under_10" | "10_to_50" | "50_to_200" | "over_200"
      swipe_direction: "left" | "right"
      watch_style:
        | "dress"
        | "diver"
        | "chronograph"
        | "pilot"
        | "field"
        | "racing"
        | "gmt"
        | "jewellery"
        | "pocket"
        | "other"
        | "sports"
      winding: "manual" | "automatic" | "quartz"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["buyer", "dealer"],
      application_status: ["pending", "approved", "declined"],
      case_material: [
        "steel",
        "yellow_gold",
        "rose_gold",
        "white_gold",
        "platinum",
        "two_tone",
        "titanium",
        "bronze",
        "silver",
        "other",
      ],
      complication: [
        "chronograph",
        "date",
        "day_date",
        "triple_calendar",
        "annual_calendar",
        "perpetual_calendar",
        "moonphase",
        "gmt",
        "world_time",
        "alarm",
        "power_reserve",
        "tourbillon",
        "minute_repeater",
        "jump_hour",
        "skeleton",
      ],
      dealer_permission: ["pending", "approved", "revoked"],
      dial_color: [
        "black",
        "white",
        "silver",
        "champagne",
        "gilt",
        "blue",
        "green",
        "grey",
        "salmon",
        "brown",
        "cream",
        "other",
      ],
      import_status: ["queued", "running", "succeeded", "failed"],
      inquiry_status: ["pending", "sent", "failed"],
      listing_status: ["active", "hidden"],
      listing_volume: ["under_10", "10_to_50", "50_to_200", "over_200"],
      swipe_direction: ["left", "right"],
      watch_style: [
        "dress",
        "diver",
        "chronograph",
        "pilot",
        "field",
        "racing",
        "gmt",
        "jewellery",
        "pocket",
        "other",
        "sports",
      ],
      winding: ["manual", "automatic", "quartz"],
    },
  },
} as const

