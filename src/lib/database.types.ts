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
          url: string
        }
        Insert: {
          id?: string
          listing_id: string
          position?: number
          url: string
        }
        Update: {
          id?: string
          listing_id?: string
          position?: number
          url?: string
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
          brand: string
          case_size_mm: number | null
          condition: string | null
          created_at: string
          currency: string
          dealer_id: string
          description: string | null
          has_box: boolean | null
          has_papers: boolean | null
          id: string
          import_job_id: string | null
          imported_by: string
          model: string | null
          movement: string | null
          price_cents: number | null
          reference: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["listing_status"]
          year: number | null
        }
        Insert: {
          brand: string
          case_size_mm?: number | null
          condition?: string | null
          created_at?: string
          currency?: string
          dealer_id: string
          description?: string | null
          has_box?: boolean | null
          has_papers?: boolean | null
          id?: string
          import_job_id?: string | null
          imported_by: string
          model?: string | null
          movement?: string | null
          price_cents?: number | null
          reference?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          year?: number | null
        }
        Update: {
          brand?: string
          case_size_mm?: number | null
          condition?: string | null
          created_at?: string
          currency?: string
          dealer_id?: string
          description?: string | null
          has_box?: boolean | null
          has_papers?: boolean | null
          id?: string
          import_job_id?: string | null
          imported_by?: string
          model?: string | null
          movement?: string | null
          price_cents?: number | null
          reference?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
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
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
        }
        Relationships: []
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
      get_deck: {
        Args: { p_limit?: number }
        Returns: {
          brand: string
          case_size_mm: number | null
          condition: string | null
          created_at: string
          currency: string
          dealer_id: string
          description: string | null
          has_box: boolean | null
          has_papers: boolean | null
          id: string
          import_job_id: string | null
          imported_by: string
          model: string | null
          movement: string | null
          price_cents: number | null
          reference: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["listing_status"]
          year: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      dealer_permission: "pending" | "approved" | "revoked"
      import_status: "queued" | "running" | "succeeded" | "failed"
      inquiry_status: "pending" | "sent" | "failed"
      listing_status: "active" | "hidden"
      swipe_direction: "left" | "right"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      dealer_permission: ["pending", "approved", "revoked"],
      import_status: ["queued", "running", "succeeded", "failed"],
      inquiry_status: ["pending", "sent", "failed"],
      listing_status: ["active", "hidden"],
      swipe_direction: ["left", "right"],
    },
  },
} as const

