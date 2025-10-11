export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cip_types: {
        Row: {
          created_at: string
          id: string
          type_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          type_name: string
        }
        Update: {
          created_at?: string
          id?: string
          type_name?: string
        }
        Relationships: []
      }
      cips: {
        Row: {
          cip_number: string
          cip_type: string | null
          created_at: string
          explorer_url: string | null
          github_link: string | null
          id: string
          requires_onchain_vote: boolean
          status: string
          title: string
          updated_at: string
          vote_close_date: string | null
          vote_start_date: string | null
        }
        Insert: {
          cip_number: string
          cip_type?: string | null
          created_at?: string
          explorer_url?: string | null
          github_link?: string | null
          id?: string
          requires_onchain_vote?: boolean
          status?: string
          title: string
          updated_at?: string
          vote_close_date?: string | null
          vote_start_date?: string | null
        }
        Update: {
          cip_number?: string
          cip_type?: string | null
          created_at?: string
          explorer_url?: string | null
          github_link?: string | null
          id?: string
          requires_onchain_vote?: boolean
          status?: string
          title?: string
          updated_at?: string
          vote_close_date?: string | null
          vote_start_date?: string | null
        }
        Relationships: []
      }
      committee_votes: {
        Row: {
          cip_id: string
          contact: string
          created_at: string
          email: string
          id: string
          member_name: string
          updated_at: string
          vote: string | null
          weight: number
        }
        Insert: {
          cip_id: string
          contact: string
          created_at?: string
          email: string
          id?: string
          member_name: string
          updated_at?: string
          vote?: string | null
          weight?: number
        }
        Update: {
          cip_id?: string
          contact?: string
          created_at?: string
          email?: string
          id?: string
          member_name?: string
          updated_at?: string
          vote?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "committee_votes_cip_id_fkey"
            columns: ["cip_id"]
            isOneToOne: false
            referencedRelation: "cips"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_app_committee_votes: {
        Row: {
          contact: string
          created_at: string
          email: string
          featured_app_id: string
          id: string
          member_name: string
          updated_at: string
          vote: string | null
          weight: number
        }
        Insert: {
          contact: string
          created_at?: string
          email: string
          featured_app_id: string
          id?: string
          member_name: string
          updated_at?: string
          vote?: string | null
          weight?: number
        }
        Update: {
          contact?: string
          created_at?: string
          email?: string
          featured_app_id?: string
          id?: string
          member_name?: string
          updated_at?: string
          vote?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "featured_app_committee_votes_featured_app_id_fkey"
            columns: ["featured_app_id"]
            isOneToOne: false
            referencedRelation: "featured_app_votes"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_app_votes: {
        Row: {
          app_name: string
          created_at: string
          description: string | null
          id: string
          status: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          app_name: string
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          app_name?: string
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: []
      }
      sv_votes: {
        Row: {
          cip_id: string
          contact: string
          created_at: string
          email: string
          id: string
          organization: string
          updated_at: string
          vote: string | null
          weight: number
        }
        Insert: {
          cip_id: string
          contact: string
          created_at?: string
          email: string
          id?: string
          organization: string
          updated_at?: string
          vote?: string | null
          weight?: number
        }
        Update: {
          cip_id?: string
          contact?: string
          created_at?: string
          email?: string
          id?: string
          organization?: string
          updated_at?: string
          vote?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "sv_votes_cip_id_fkey"
            columns: ["cip_id"]
            isOneToOne: false
            referencedRelation: "cips"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
