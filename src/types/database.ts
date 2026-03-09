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
      form_templates: {
        Row: {
          abbreviation: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          instance_counter: number
          is_active: boolean
          name: string
          sharing_mode: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          instance_counter?: number
          is_active?: boolean
          name: string
          sharing_mode?: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          instance_counter?: number
          is_active?: boolean
          name?: string
          sharing_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          full_name: string
          group_id: string
          id: string
          proposed_role: string
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          full_name: string
          group_id: string
          id?: string
          proposed_role: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          full_name?: string
          group_id?: string
          id?: string
          proposed_role?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_member_count"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          email_change_count: number
          full_name: string
          group_id: string | null
          id: string
          invite_status: string
          is_active: boolean
          last_invite_sent_at: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_change_count?: number
          full_name: string
          group_id?: string | null
          id: string
          invite_status?: string
          is_active?: boolean
          last_invite_sent_at?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_change_count?: number
          full_name?: string
          group_id?: string | null
          id?: string
          invite_status?: string
          is_active?: boolean
          last_invite_sent_at?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_member_count"
            referencedColumns: ["id"]
          },
        ]
      }
      template_fields: {
        Row: {
          created_at: string
          field_type: string
          id: string
          is_required: boolean
          label: string
          options: Json | null
          sort_order: number
          template_section_id: string
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string
          field_type: string
          id?: string
          is_required?: boolean
          label: string
          options?: Json | null
          sort_order: number
          template_section_id: string
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          is_required?: boolean
          label?: string
          options?: Json | null
          sort_order?: number
          template_section_id?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "template_fields_template_section_id_fkey"
            columns: ["template_section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      template_group_access: {
        Row: {
          created_at: string
          group_id: string
          id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          template_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_group_access_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_group_access_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_member_count"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_group_access_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          sort_order: number
          template_version_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          sort_order: number
          template_version_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          template_version_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_latest: boolean
          restored_from: string | null
          template_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_latest?: boolean
          restored_from?: string | null
          template_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_latest?: boolean
          restored_from?: string | null
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_versions_restored_from_fkey"
            columns: ["restored_from"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      groups_with_member_count: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          is_active: boolean | null
          member_count: number | null
          name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_current_user_group_id: { Args: never; Returns: string }
      get_current_user_role: { Args: never; Returns: string }
      is_active_user: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

