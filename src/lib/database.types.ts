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
      buyer_events: {
        Row: {
          dealer_id: string | null
          dwell_ms: number | null
          exposure_id: string | null
          filter: Json | null
          guest_key: string | null
          id: string
          kind: Database["public"]["Enums"]["buyer_event_kind"]
          listing_id: string | null
          occurred_at: string
          photo_index: number | null
          position: number | null
          received_at: string
          surface: Database["public"]["Enums"]["buyer_event_surface"]
          user_id: string
        }
        Insert: {
          dealer_id?: string | null
          dwell_ms?: number | null
          exposure_id?: string | null
          filter?: Json | null
          guest_key?: string | null
          id: string
          kind: Database["public"]["Enums"]["buyer_event_kind"]
          listing_id?: string | null
          occurred_at: string
          photo_index?: number | null
          position?: number | null
          received_at?: string
          surface: Database["public"]["Enums"]["buyer_event_surface"]
          user_id: string
        }
        Update: {
          dealer_id?: string | null
          dwell_ms?: number | null
          exposure_id?: string | null
          filter?: Json | null
          guest_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["buyer_event_kind"]
          listing_id?: string | null
          occurred_at?: string
          photo_index?: number | null
          position?: number | null
          received_at?: string
          surface?: Database["public"]["Enums"]["buyer_event_surface"]
          user_id?: string
        }
        Relationships: []
      }
      catalogue_batch_listings: {
        Row: {
          batch_id: string
          listing_id: string
        }
        Insert: {
          batch_id: string
          listing_id: string
        }
        Update: {
          batch_id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_batch_listings_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "catalogue_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_batch_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_batches: {
        Row: {
          id: string
          listing_count: number
          sealed_at: string
        }
        Insert: {
          id: string
          listing_count: number
          sealed_at?: string
        }
        Update: {
          id?: string
          listing_count?: number
          sealed_at?: string
        }
        Relationships: []
      }
      checkout_defaults: {
        Row: {
          payment_label: string | null
          ship_to: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          payment_label?: string | null
          ship_to?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          payment_label?: string | null
          ship_to?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_defaults_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_deals: {
        Row: {
          accepted_at: string | null
          amount_cents: number
          buyer_id: string
          cancelled_reason: string | null
          completed_at: string | null
          conversation_id: string
          created_at: string
          currency: string
          expires_at: string | null
          fee_bps: number
          fee_cents: number | null
          funded_at: string | null
          id: string
          listing_id: string | null
          message_id: string | null
          payment_intent_id: string | null
          payment_provider: string | null
          proposed_by: string
          reviewed_at: string | null
          seller_id: string
          ship_by: string | null
          ship_to: Json | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["deal_status"]
          tracking_carrier: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          amount_cents: number
          buyer_id: string
          cancelled_reason?: string | null
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          fee_bps?: number
          fee_cents?: number | null
          funded_at?: string | null
          id?: string
          listing_id?: string | null
          message_id?: string | null
          payment_intent_id?: string | null
          payment_provider?: string | null
          proposed_by: string
          reviewed_at?: string | null
          seller_id: string
          ship_by?: string | null
          ship_to?: Json | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          tracking_carrier?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          amount_cents?: number
          buyer_id?: string
          cancelled_reason?: string | null
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          fee_bps?: number
          fee_cents?: number | null
          funded_at?: string | null
          id?: string
          listing_id?: string | null
          message_id?: string | null
          payment_intent_id?: string | null
          payment_provider?: string | null
          proposed_by?: string
          reviewed_at?: string | null
          seller_id?: string
          ship_by?: string | null
          ship_to?: Json | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          tracking_carrier?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_deals_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_deals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_deals_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_deals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_deals_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          dealer_id: string | null
          id: string
          is_group: boolean
          last_message_at: string
          members_key: string | null
          opener_id: string
          partner_id: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          dealer_id?: string | null
          id?: string
          is_group?: boolean
          last_message_at?: string
          members_key?: string | null
          opener_id: string
          partner_id?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          dealer_id?: string | null
          id?: string
          is_group?: boolean
          last_message_at?: string
          members_key?: string | null
          opener_id?: string
          partner_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_opener_id_fkey"
            columns: ["opener_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_reviews: {
        Row: {
          body: string | null
          created_at: string
          deal_id: string
          dealer_id: string | null
          id: string
          rating: number
          reviewer_id: string
          subject_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deal_id: string
          dealer_id?: string | null
          id?: string
          rating: number
          reviewer_id: string
          subject_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deal_id?: string
          dealer_id?: string | null
          id?: string
          rating?: number
          reviewer_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_reviews_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "conversation_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_reviews_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          handoff: boolean
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
          handoff?: boolean
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
          handoff?: boolean
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
      dealer_follows: {
        Row: {
          created_at: string
          dealer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_follows_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_follows_user_id_fkey"
            columns: ["user_id"]
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
          created_by: string | null
          description: string | null
          id: string
          instagram: string | null
          last_sync_added: number | null
          last_sync_changed: number | null
          last_sync_complete: boolean | null
          last_sync_error: string | null
          last_sync_found: number | null
          last_sync_relisted: number | null
          last_sync_retired: number | null
          last_synced_at: string | null
          logo_url: string | null
          name: string
          permission: Database["public"]["Enums"]["dealer_permission"]
          website: string | null
        }
        Insert: {
          claimed_by?: string | null
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          instagram?: string | null
          last_sync_added?: number | null
          last_sync_changed?: number | null
          last_sync_complete?: boolean | null
          last_sync_error?: string | null
          last_sync_found?: number | null
          last_sync_relisted?: number | null
          last_sync_retired?: number | null
          last_synced_at?: string | null
          logo_url?: string | null
          name: string
          permission?: Database["public"]["Enums"]["dealer_permission"]
          website?: string | null
        }
        Update: {
          claimed_by?: string | null
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          instagram?: string | null
          last_sync_added?: number | null
          last_sync_changed?: number | null
          last_sync_complete?: boolean | null
          last_sync_error?: string | null
          last_sync_found?: number | null
          last_sync_relisted?: number | null
          last_sync_retired?: number | null
          last_synced_at?: string | null
          logo_url?: string | null
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
      device_push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_notifications: {
        Row: {
          body: string
          created_at: string
          dealer_id: string | null
          dealer_ids: string[]
          destination: string
          expo_ticket_ids: string[]
          id: string
          listing_ids: string[]
          notified_on: string
          notified_through: string
          opened_at: string | null
          sent_at: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dealer_id?: string | null
          dealer_ids: string[]
          destination: string
          expo_ticket_ids?: string[]
          id?: string
          listing_ids: string[]
          notified_on?: string
          notified_through: string
          opened_at?: string | null
          sent_at?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dealer_id?: string | null
          dealer_ids?: string[]
          destination?: string
          expo_ticket_ids?: string[]
          id?: string
          listing_ids?: string[]
          notified_on?: string
          notified_through?: string
          opened_at?: string | null
          sent_at?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_notifications_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drop_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_views: {
        Row: {
          listing_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          listing_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          listing_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_views_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drop_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_comments: {
        Row: {
          author_handle: string | null
          author_id: string
          author_number: number
          body: string
          created_at: string
          id: string
          parent_id: string | null
          post_id: string
        }
        Insert: {
          author_handle?: string | null
          author_id: string
          author_number: number
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id: string
        }
        Update: {
          author_handle?: string | null
          author_id?: string
          author_number?: number
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "exchange_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "exchange_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_photos: {
        Row: {
          id: string
          position: number
          post_id: string
          storage_path: string
        }
        Insert: {
          id?: string
          position: number
          post_id: string
          storage_path: string
        }
        Update: {
          id?: string
          position?: number
          post_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_photos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "exchange_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_posts: {
        Row: {
          author_handle: string | null
          author_id: string
          author_number: number
          body: string
          created_at: string
          currency: string
          id: string
          intent: Database["public"]["Enums"]["exchange_intent"]
          price_cents: number | null
          title: string
        }
        Insert: {
          author_handle?: string | null
          author_id: string
          author_number: number
          body: string
          created_at?: string
          currency?: string
          id?: string
          intent: Database["public"]["Enums"]["exchange_intent"]
          price_cents?: number | null
          title: string
        }
        Update: {
          author_handle?: string | null
          author_id?: string
          author_number?: number
          body?: string
          created_at?: string
          currency?: string
          id?: string
          intent?: Database["public"]["Enums"]["exchange_intent"]
          price_cents?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_votes: {
        Row: {
          comment_id: string | null
          created_at: string
          post_id: string | null
          user_id: string
          value: number
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          post_id?: string | null
          user_id: string
          value?: number
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          post_id?: string | null
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "exchange_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "exchange_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "exchange_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_votes_user_id_fkey"
            columns: ["user_id"]
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
          resume_page: number | null
          source_url: string
          status: Database["public"]["Enums"]["import_status"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          dealer_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          listings_created?: number
          provider: string
          resume_page?: number | null
          source_url: string
          status?: Database["public"]["Enums"]["import_status"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          dealer_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          listings_created?: number
          provider?: string
          resume_page?: number | null
          source_url?: string
          status?: Database["public"]["Enums"]["import_status"]
          user_id?: string | null
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
          opened_at: string | null
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
          opened_at?: string | null
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
          opened_at?: string | null
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
          cost_cents: number | null
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
          imported_by: string | null
          model: string | null
          price_cents: number | null
          reference: string | null
          sold_at: string | null
          sold_source: string | null
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
          cost_cents?: number | null
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
          imported_by?: string | null
          model?: string | null
          price_cents?: number | null
          reference?: string | null
          sold_at?: string | null
          sold_source?: string | null
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
          cost_cents?: number | null
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
          imported_by?: string | null
          model?: string | null
          price_cents?: number | null
          reference?: string | null
          sold_at?: string | null
          sold_source?: string | null
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
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deal_id: string | null
          id: string
          listing_id: string | null
          photo_path: string | null
          sender_id: string
          via: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deal_id?: string | null
          id?: string
          listing_id?: string | null
          photo_path?: string | null
          sender_id: string
          via?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deal_id?: string | null
          id?: string
          listing_id?: string | null
          photo_path?: string | null
          sender_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "conversation_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_actions: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          operator_id: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          operator_id?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          operator_id?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_actions_operator_id_fkey"
            columns: ["operator_id"]
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
          collecting_years:
            | Database["public"]["Enums"]["collecting_years"]
            | null
          collection_size: Database["public"]["Enums"]["collection_size"] | null
          collector_number: number
          created_at: string
          date_of_birth: string | null
          favorite_brands: string[]
          first_name: string | null
          handle: string | null
          hunting_for: Database["public"]["Enums"]["watch_hunt"][]
          id: string
          last_name: string | null
          notifications_enabled: boolean
          notify_new_arrivals: boolean
          notify_saved_watches: boolean
          onboarded_at: string | null
          search_pain_points: Database["public"]["Enums"]["watch_search_pain"][]
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          avatar_url?: string | null
          bio?: string | null
          collecting_years?:
            | Database["public"]["Enums"]["collecting_years"]
            | null
          collection_size?:
            | Database["public"]["Enums"]["collection_size"]
            | null
          collector_number?: number
          created_at?: string
          date_of_birth?: string | null
          favorite_brands?: string[]
          first_name?: string | null
          handle?: string | null
          hunting_for?: Database["public"]["Enums"]["watch_hunt"][]
          id: string
          last_name?: string | null
          notifications_enabled?: boolean
          notify_new_arrivals?: boolean
          notify_saved_watches?: boolean
          onboarded_at?: string | null
          search_pain_points?: Database["public"]["Enums"]["watch_search_pain"][]
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          avatar_url?: string | null
          bio?: string | null
          collecting_years?:
            | Database["public"]["Enums"]["collecting_years"]
            | null
          collection_size?:
            | Database["public"]["Enums"]["collection_size"]
            | null
          collector_number?: number
          created_at?: string
          date_of_birth?: string | null
          favorite_brands?: string[]
          first_name?: string | null
          handle?: string | null
          hunting_for?: Database["public"]["Enums"]["watch_hunt"][]
          id?: string
          last_name?: string | null
          notifications_enabled?: boolean
          notify_new_arrivals?: boolean
          notify_saved_watches?: boolean
          onboarded_at?: string | null
          search_pain_points?: Database["public"]["Enums"]["watch_search_pain"][]
        }
        Relationships: []
      }
      refresh_runs: {
        Row: {
          added: number
          changed: number
          complete: boolean | null
          dealer_id: string
          error: string | null
          fatal: boolean
          finished_at: string
          found: number
          http_status: number | null
          id: string
          ok: boolean
          pending: number
          published: number
          relisted: number
          retired: number
          skipped: boolean
          skipped_listings: number
        }
        Insert: {
          added?: number
          changed?: number
          complete?: boolean | null
          dealer_id: string
          error?: string | null
          fatal?: boolean
          finished_at?: string
          found?: number
          http_status?: number | null
          id?: string
          ok: boolean
          pending?: number
          published?: number
          relisted?: number
          retired?: number
          skipped?: boolean
          skipped_listings?: number
        }
        Update: {
          added?: number
          changed?: number
          complete?: boolean | null
          dealer_id?: string
          error?: string | null
          fatal?: boolean
          finished_at?: string
          found?: number
          http_status?: number | null
          id?: string
          ok?: boolean
          pending?: number
          published?: number
          relisted?: number
          retired?: number
          skipped?: boolean
          skipped_listings?: number
        }
        Relationships: [
          {
            foreignKeyName: "refresh_runs_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
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
          hold_reason: string | null
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
          hold_reason?: string | null
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
          hold_reason?: string | null
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
      watch_catalog_sync: {
        Row: {
          finished_at: string | null
          id: number
          last_page: number | null
          models_synced: number
          source: string
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          finished_at?: string | null
          id?: number
          last_page?: number | null
          models_synced?: number
          source?: string
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          finished_at?: string | null
          id?: number
          last_page?: number | null
          models_synced?: number
          source?: string
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      watch_models: {
        Row: {
          brand_name: string
          brand_slug: string
          dials_id: string
          id: string
          model_slug: string
          name: string
          reference_number: string | null
          series_name: string
          series_slug: string
          synced_at: string
          thumbnail_url: string | null
        }
        Insert: {
          brand_name: string
          brand_slug: string
          dials_id: string
          id?: string
          model_slug: string
          name: string
          reference_number?: string | null
          series_name: string
          series_slug: string
          synced_at?: string
          thumbnail_url?: string | null
        }
        Update: {
          brand_name?: string
          brand_slug?: string
          dials_id?: string
          id?: string
          model_slug?: string
          name?: string
          reference_number?: string | null
          series_name?: string
          series_slug?: string
          synced_at?: string
          thumbnail_url?: string | null
        }
        Relationships: []
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
      bot_set_dealer_permission: {
        Args: {
          p_dealer_id: string
          p_permission: Database["public"]["Enums"]["dealer_permission"]
        }
        Returns: Database["public"]["Enums"]["dealer_permission"]
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
      catalogue_photo_gaps: {
        Args: never
        Returns: {
          dealer_id: string
          missing_photos: number
          name: string
          photo_count: number
          published_listings: number
          website: string
        }[]
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
      claim_username: { Args: { candidate: string }; Returns: string }
      collector_profile: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          collector_number: number
          handle: string
          id: string
          name: string
        }[]
      }
      complete_conversation_deal: {
        Args: { p_deal_id: string }
        Returns: undefined
      }
      controls_dealer: { Args: { p_dealer_id: string }; Returns: boolean }
      conversation_about_listing: {
        Args: { p_listing_id: string }
        Returns: string
      }
      conversation_header: {
        Args: { p_conversation_id: string }
        Returns: {
          by_email: boolean
          dealer_id: string
          dealer_logo_url: string
          dealer_name: string
          group_handles: string[]
          group_names: string[]
          group_title: string
          id: string
          is_group: boolean
          member_count: number
          members: Json
          person_avatar_url: string
          person_handle: string
          person_id: string
          person_name: string
          person_number: number
          thread_dealer_id: string
          writable: boolean
        }[]
      }
      conversation_list: {
        Args: never
        Returns: {
          by_email: boolean
          dealer_id: string
          dealer_logo_url: string
          dealer_name: string
          group_handles: string[]
          group_names: string[]
          group_title: string
          id: string
          is_group: boolean
          last_at: string
          last_body: string
          last_mine: boolean
          last_sender_name: string
          member_count: number
          person_avatar_url: string
          person_handle: string
          person_id: string
          person_name: string
          person_number: number
          thread_dealer_id: string
          unread: number
        }[]
      }
      conversation_with_dealer: {
        Args: { p_dealer_id: string }
        Returns: string
      }
      conversation_with_handle: { Args: { p_handle: string }; Returns: string }
      conversation_with_person: { Args: { p_user_id: string }; Returns: string }
      conversation_writable: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      create_conversation_deal: {
        Args: {
          p_amount_cents: number
          p_conversation_id: string
          p_currency?: string
          p_expires_in_hours?: number
          p_listing_id?: string
          p_proposer_is_seller?: boolean
        }
        Returns: string
      }
      create_group: {
        Args: { p_member_ids: string[]; p_title?: string }
        Returns: string
      }
      deal_fee_cents: {
        Args: { p_amount_cents: number; p_fee_bps: number }
        Returns: number
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
      dealer_conversation: {
        Args: { p_buyer_id: string; p_dealer_id: string }
        Returns: string
      }
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
      dealer_top_customers: {
        Args: { p_dealer_id: string }
        Returns: {
          buyer_id: string
          display_name: string
          handle: string
          inquiries: number
          last_active: string
          passes: number
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
      delete_own_account: { Args: never; Returns: undefined }
      discovery_visible_to_caller: {
        Args: {
          p_dealer_claimed_by: string
          p_exclude_own: boolean
          p_imported_by: string
        }
        Returns: boolean
      }
      drop_max_age: { Args: never; Returns: string }
      exchange_feed: {
        Args: never
        Returns: {
          author_avatar_url: string
          author_handle: string
          author_id: string
          author_name: string
          author_number: number
          body: string
          comment_count: number
          cover_path: string
          created_at: string
          currency: string
          id: string
          intent: Database["public"]["Enums"]["exchange_intent"]
          my_vote: number
          price_cents: number
          title: string
          vote_count: number
        }[]
      }
      exchange_post_author: {
        Args: { p_post_id: string }
        Returns: {
          author_avatar_url: string
          author_handle: string
          author_id: string
          author_name: string
          author_number: number
          my_vote: number
          vote_count: number
        }[]
      }
      exchange_thread: {
        Args: { p_post_id: string }
        Returns: {
          author_avatar_url: string
          author_handle: string
          author_id: string
          author_name: string
          author_number: number
          body: string
          created_at: string
          id: string
          my_vote: number
          parent_id: string
          vote_count: number
        }[]
      }
      exchange_vote: {
        Args: { p_comment_id: string; p_post_id: string; p_value: number }
        Returns: undefined
      }
      expire_conversation_deals: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      followed_new_listing_ids: {
        Args: never
        Returns: {
          created_at: string
          id: string
        }[]
      }
      format_deal_amount: {
        Args: { p_amount_cents: number; p_currency: string }
        Returns: string
      }
      fund_conversation_deal: {
        Args: { p_deal_id: string; p_payment_label?: string; p_ship_to: Json }
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
          cost_cents: number | null
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
          imported_by: string | null
          model: string | null
          price_cents: number | null
          reference: string | null
          sold_at: string | null
          sold_source: string | null
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
      in_conversation: { Args: { p_conversation_id: string }; Returns: boolean }
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
      last_sync_additions: {
        Args: { p_dealer_id?: string }
        Returns: {
          added_at: string
          dealer_id: string
          listing_id: string
        }[]
      }
      latest_catalogue_batch: {
        Args: never
        Returns: {
          batch_id: string
          listing_ids: string[]
          sealed_at: string
        }[]
      }
      listing_counts: {
        Args: {
          p_brands?: string[]
          p_complications?: Database["public"]["Enums"]["complication"][]
          p_dealers?: string[]
          p_exclude_own?: boolean
          p_exclude_swiped?: boolean
          p_materials?: Database["public"]["Enums"]["case_material"][]
          p_price_maxs?: number[]
          p_price_mins?: number[]
          p_query?: string
          p_size_maxs?: number[]
          p_size_mins?: number[]
          p_styles?: Database["public"]["Enums"]["watch_style"][]
          p_windings?: Database["public"]["Enums"]["winding"][]
          p_year_maxs?: number[]
          p_year_mins?: number[]
        }
        Returns: {
          matched: number
          total: number
        }[]
      }
      listing_counts_v2: {
        Args: {
          p_exclude_own?: boolean
          p_exclude_swiped?: boolean
          p_spec?: Json
        }
        Returns: {
          matched: number
          total: number
        }[]
      }
      listing_facets: {
        Args: { p_exclude_own?: boolean }
        Returns: {
          count: number
          kind: string
          label: string
          value: string
        }[]
      }
      listing_facets_v2: {
        Args: {
          p_exclude_own?: boolean
          p_exclude_swiped?: boolean
          p_spec?: Json
        }
        Returns: {
          count: number
          kind: string
          label: string
          value: string
        }[]
      }
      listing_gallery_ready: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      listing_matches: {
        Args: {
          p_listing: Database["public"]["Tables"]["listings"]["Row"]
          p_spec: Json
        }
        Returns: boolean
      }
      listing_on_deck: {
        Args: { p_listing: Database["public"]["Tables"]["listings"]["Row"] }
        Returns: boolean
      }
      listing_photo_counts: {
        Args: never
        Returns: {
          dealer_id: string
          missing_photos: number
          photo_count: number
          published_listings: number
        }[]
      }
      log_buyer_events: { Args: { p_events: Json }; Returns: number }
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
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_drops_seen: { Args: { p_dealer_id?: string }; Returns: number }
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
      operator_activity: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          after: Json
          before: Json
          created_at: string
          id: string
          operator_id: string
          operator_label: string
          target_id: string
          target_type: string
        }[]
      }
      operator_catalog_problems: {
        Args: { p_dealer_id: string }
        Returns: {
          error: string
          id: string
          last_seen_at: string
          queued: boolean
          source_url: string
          title: string
        }[]
      }
      operator_conversation_messages: {
        Args: { p_conversation_id: string; p_limit?: number }
        Returns: {
          body: string
          created_at: string
          deal_status: string
          id: string
          listing_label: string
          sender_handle: string
          sender_label: string
          via: string
        }[]
      }
      operator_conversations: {
        Args: {
          p_dealer_id?: string
          p_limit?: number
          p_unanswered_only?: boolean
        }
        Returns: {
          buyer_handle: string
          buyer_label: string
          id: string
          is_group: boolean
          last_message_at: string
          message_count: number
          partner_handle: string
          partner_label: string
          preview: string
          shop_id: string
          shop_name: string
          unanswered: boolean
        }[]
      }
      operator_dashboard: { Args: never; Returns: Json }
      operator_dealers: {
        Args: never
        Returns: {
          can_import: boolean
          catalog_failed: number
          catalog_queued: number
          catalog_total: number
          claim_code_expires_at: string
          claimed_by: string
          claimer_handle: string
          claimer_last_sign_in_at: string
          claimer_name: string
          contact_email: string
          created_at: string
          id: string
          last_refresh_at: string
          last_refresh_attempt_ok: boolean
          last_refresh_error: string
          last_refresh_ok_at: string
          last_refresh_published: number
          last_refresh_skipped: number
          last_sync_added: number
          last_sync_changed: number
          last_sync_complete: boolean
          last_sync_error: string
          last_sync_found: number
          last_sync_relisted: number
          last_sync_retired: number
          last_synced_at: string
          listings_held: number
          listings_in_deck: number
          listings_missing_photos: number
          name: string
          neglect_flags: string[]
          permission: Database["public"]["Enums"]["dealer_permission"]
          photo_count: number
          unanswered_count: number
          website: string
        }[]
      }
      operator_delete_dealer: {
        Args: { p_dealer_id: string }
        Returns: string[]
      }
      operator_delete_listing: {
        Args: { p_listing_id: string }
        Returns: string[]
      }
      operator_edit_listing: {
        Args: {
          p_brand: string
          p_case_size_mm?: number
          p_condition?: string
          p_description?: string
          p_listing_id: string
          p_model?: string
          p_price_cents?: number
          p_reference?: string
          p_year?: number
        }
        Returns: undefined
      }
      operator_inquiries: {
        Args: {
          p_dealer_id?: string
          p_limit?: number
          p_unanswered_only?: boolean
        }
        Returns: {
          buyer_handle: string
          buyer_label: string
          conversation_id: string
          created_at: string
          id: string
          listing_label: string
          message: string
          shop_name: string
          status: Database["public"]["Enums"]["inquiry_status"]
          unanswered: boolean
        }[]
      }
      operator_issue_claim_code: {
        Args: { p_dealer_id: string }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      operator_last_sync_counts: {
        Args: never
        Returns: {
          dealer_id: string
          new_count: number
        }[]
      }
      operator_last_sync_listings: {
        Args: { p_dealer_id: string }
        Returns: {
          added_at: string
          brand: string
          currency: string
          id: string
          model: string
          price_cents: number
          shop_url: string
          source_url: string
          thumb_path: string
          thumb_source_url: string
        }[]
      }
      operator_listings: {
        Args: { p_dealer_id: string }
        Returns: {
          brand: string
          case_size_mm: number
          condition: string
          created_at: string
          currency: string
          description: string
          edited_fields: string[]
          id: string
          inquiry_count: number
          model: string
          photo_count: number
          price_cents: number
          reference: string
          saved_count: number
          sold_at: string
          source_url: string
          status: Database["public"]["Enums"]["listing_status"]
          thumb_path: string
          year: number
        }[]
      }
      operator_recent_users: {
        Args: { p_limit?: number }
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at: string
          first_name: string
          handle: string
          id: string
          last_active: string
          onboarded: boolean
          swipe_count: number
        }[]
      }
      operator_refresh_schedule: {
        Args: never
        Returns: {
          approved_shops: number
          last_attempt_at: string
          last_attempt_error: string
          last_attempt_ok: boolean
          last_catalog_sync_at: string
          last_success_at: string
          recorded_runs: number
        }[]
      }
      operator_revoke_claim_code: {
        Args: { p_dealer_id: string }
        Returns: number
      }
      operator_set_listing_sold: {
        Args: { p_listing_id: string; p_sold: boolean }
        Returns: string
      }
      operator_set_listing_status: {
        Args: {
          p_listing_id: string
          p_status: Database["public"]["Enums"]["listing_status"]
        }
        Returns: Database["public"]["Enums"]["listing_status"]
      }
      operator_unclaim_shop: {
        Args: { p_dealer_id: string }
        Returns: undefined
      }
      operator_user_detail: { Args: { p_user_id: string }; Returns: Json }
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
          hold_reason: string | null
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
      record_bot_action: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      record_dealer_sync: {
        Args: {
          p_added?: number
          p_changed?: number
          p_complete: boolean
          p_dealer_id: string
          p_error?: string
          p_found?: number
          p_relisted?: number
          p_retired?: number
        }
        Returns: undefined
      }
      record_drop_opened: { Args: { p_id: string }; Returns: undefined }
      record_operator_action: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      rename_group: {
        Args: { p_conversation_id: string; p_title: string }
        Returns: undefined
      }
      replace_listing_photos: {
        Args: { p_listing_id: string; p_photos: Json }
        Returns: number
      }
      require_operator: { Args: never; Returns: undefined }
      respond_to_conversation_deal: {
        Args: { p_action: string; p_deal_id: string }
        Returns: undefined
      }
      review_conversation_deal: {
        Args: { p_body?: string; p_deal_id: string; p_rating: number }
        Returns: string
      }
      revise_conversation_deal: {
        Args: { p_amount_cents: number; p_deal_id: string }
        Returns: undefined
      }
      save_exchange_post: {
        Args: {
          p_body?: string
          p_intent?: Database["public"]["Enums"]["exchange_intent"]
          p_photo_paths?: string[]
          p_post_id?: string
          p_price_cents?: number
          p_title?: string
        }
        Returns: string
      }
      seal_catalogue_batch: {
        Args: { p_batch_id: string }
        Returns: {
          batch_id: string
          created: boolean
          listing_count: number
        }[]
      }
      search_listings: {
        Args: {
          p_brands?: string[]
          p_complications?: Database["public"]["Enums"]["complication"][]
          p_dealers?: string[]
          p_exclude_own?: boolean
          p_exclude_swiped?: boolean
          p_favorites_first?: boolean
          p_limit?: number
          p_materials?: Database["public"]["Enums"]["case_material"][]
          p_offset?: number
          p_price_maxs?: number[]
          p_price_mins?: number[]
          p_query?: string
          p_size_maxs?: number[]
          p_size_mins?: number[]
          p_sort?: string
          p_styles?: Database["public"]["Enums"]["watch_style"][]
          p_windings?: Database["public"]["Enums"]["winding"][]
          p_year_maxs?: number[]
          p_year_mins?: number[]
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
          cost_cents: number | null
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
          imported_by: string | null
          model: string | null
          price_cents: number | null
          reference: string | null
          sold_at: string | null
          sold_source: string | null
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
      search_listings_v2: {
        Args: {
          p_cursor?: string
          p_exclude_own?: boolean
          p_exclude_swiped?: boolean
          p_favorites_first?: boolean
          p_limit?: number
          p_sort?: string
          p_spec?: Json
        }
        Returns: {
          cursor: string
          listing: Database["public"]["Tables"]["listings"]["Row"]
        }[]
      }
      set_dealer_permission: {
        Args: {
          p_dealer_id: string
          p_permission: Database["public"]["Enums"]["dealer_permission"]
        }
        Returns: Database["public"]["Enums"]["dealer_permission"]
      }
      ship_conversation_deal: {
        Args: {
          p_carrier: string
          p_deal_id: string
          p_tracking_number: string
        }
        Returns: undefined
      }
      ship_to_is_complete: { Args: { p_ship_to: Json }; Returns: boolean }
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
      suggest_people: {
        Args: { p_query: string }
        Returns: {
          avatar_url: string
          collector_number: number
          handle: string
          id: string
          name: string
        }[]
      }
      suggest_watches: {
        Args: { p_brand?: string; p_limit?: number; p_query: string }
        Returns: {
          brand_name: string
          brand_slug: string
          id: string
          name: string
          reference_number: string
          series_name: string
          thumbnail_url: string
        }[]
      }
      sync_source_availability: {
        Args: {
          p_dealer_id: string
          p_read_complete: boolean
          p_seen_ids: string[]
        }
        Returns: Json
      }
      synced_listing_columns: { Args: never; Returns: string[] }
      thread_with_person: {
        Args: { p_me: string; p_them: string }
        Returns: string
      }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      unseen_drop_count: { Args: never; Returns: number }
      unseen_drops_by_dealer: {
        Args: never
        Returns: {
          dealer_id: string
          unseen: number
        }[]
      }
      url_path: { Args: { p_url: string }; Returns: string }
      verify_application_email: {
        Args: { p_application_id: string; p_code: string }
        Returns: string
      }
    }
    Enums: {
      account_type: "buyer" | "dealer"
      application_status: "pending" | "approved" | "declined"
      buyer_event_kind:
        | "impression"
        | "dwell"
        | "save"
        | "pass"
        | "unsave"
        | "undo"
        | "dealer_click"
        | "inquiry_open"
        | "follow"
        | "unfollow"
        | "filter"
      buyer_event_surface:
        | "buy"
        | "buy_grid"
        | "search"
        | "new"
        | "drops"
        | "detail"
        | "viewer"
        | "wishlist"
        | "shop"
        | "profile"
        | "messages"
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
      collecting_years:
        | "not_yet"
        | "under_a_year"
        | "one_to_five"
        | "five_to_ten"
        | "over_ten"
      collection_size:
        | "none"
        | "one_to_three"
        | "four_to_ten"
        | "eleven_plus"
        | "one"
        | "two_to_three"
        | "four_to_six"
        | "seven_to_ten"
        | "eleven_to_twenty"
        | "twenty_one_plus"
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
      deal_status:
        | "proposed"
        | "accepted"
        | "funded"
        | "shipped"
        | "completed"
        | "declined"
        | "cancelled"
        | "expired"
      dealer_permission: "pending" | "approved" | "paused" | "revoked"
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
      exchange_intent: "sell" | "buy" | "trade" | "random"
      import_status: "queued" | "running" | "succeeded" | "failed"
      inquiry_status: "pending" | "sent" | "failed"
      listing_status: "active" | "hidden"
      listing_volume: "under_10" | "10_to_50" | "50_to_200" | "over_200"
      swipe_direction: "left" | "right"
      watch_hunt: "dress" | "sports" | "tool" | "anything"
      watch_search_pain:
        | "trusting_sellers"
        | "verifying_originality"
        | "judging_condition"
        | "finding_fair_prices"
        | "finding_specific_watches"
        | "understanding_service_history"
        | "buying_online"
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
      buyer_event_kind: [
        "impression",
        "dwell",
        "save",
        "pass",
        "unsave",
        "undo",
        "dealer_click",
        "inquiry_open",
        "follow",
        "unfollow",
        "filter",
      ],
      buyer_event_surface: [
        "buy",
        "buy_grid",
        "search",
        "new",
        "drops",
        "detail",
        "viewer",
        "wishlist",
        "shop",
        "profile",
        "messages",
      ],
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
      collecting_years: [
        "not_yet",
        "under_a_year",
        "one_to_five",
        "five_to_ten",
        "over_ten",
      ],
      collection_size: [
        "none",
        "one_to_three",
        "four_to_ten",
        "eleven_plus",
        "one",
        "two_to_three",
        "four_to_six",
        "seven_to_ten",
        "eleven_to_twenty",
        "twenty_one_plus",
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
      deal_status: [
        "proposed",
        "accepted",
        "funded",
        "shipped",
        "completed",
        "declined",
        "cancelled",
        "expired",
      ],
      dealer_permission: ["pending", "approved", "paused", "revoked"],
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
      exchange_intent: ["sell", "buy", "trade", "random"],
      import_status: ["queued", "running", "succeeded", "failed"],
      inquiry_status: ["pending", "sent", "failed"],
      listing_status: ["active", "hidden"],
      listing_volume: ["under_10", "10_to_50", "50_to_200", "over_200"],
      swipe_direction: ["left", "right"],
      watch_hunt: ["dress", "sports", "tool", "anything"],
      watch_search_pain: [
        "trusting_sellers",
        "verifying_originality",
        "judging_condition",
        "finding_fair_prices",
        "finding_specific_watches",
        "understanding_service_history",
        "buying_online",
      ],
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

