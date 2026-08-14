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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      batches: {
        Row: {
          batch_number: string
          created_at: string
          current_stock: number
          expiry_date: string
          id: string
          initial_stock: number
          is_active: boolean
          product_id: string
          production_date: string
          updated_at: string
        }
        Insert: {
          batch_number: string
          created_at?: string
          current_stock?: number
          expiry_date: string
          id?: string
          initial_stock?: number
          is_active?: boolean
          product_id: string
          production_date: string
          updated_at?: string
        }
        Update: {
          batch_number?: string
          created_at?: string
          current_stock?: number
          expiry_date?: string
          id?: string
          initial_stock?: number
          is_active?: boolean
          product_id?: string
          production_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_items: {
        Row: {
          bundle_id: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          bundle_id: string
          id?: string
          product_id: string
          quantity: number
        }
        Update: {
          bundle_id?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          is_active: boolean
          marketplace_listing: string | null
          name: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace_listing?: string | null
          name: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace_listing?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundles_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      movement_reasons: {
        Row: {
          code: string
          created_at: string
          direction: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          direction: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      movement_types: {
        Row: {
          id: string
          label: string
          name: string
        }
        Insert: {
          id?: string
          label: string
          name: string
        }
        Update: {
          id?: string
          label?: string
          name?: string
        }
        Relationships: []
      }
      opname_entries: {
        Row: {
          batch_id: string
          correction_applied: boolean
          counted_at: string
          counted_by: string
          discrepancy: number | null
          id: string
          physical_count: number
          session_id: string
          system_stock: number
        }
        Insert: {
          batch_id: string
          correction_applied?: boolean
          counted_at?: string
          counted_by: string
          discrepancy?: number | null
          id?: string
          physical_count: number
          session_id: string
          system_stock: number
        }
        Update: {
          batch_id?: string
          correction_applied?: boolean
          counted_at?: string
          counted_by?: string
          discrepancy?: number | null
          id?: string
          physical_count?: number
          session_id?: string
          system_stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "opname_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opname_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "opname_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      opname_sessions: {
        Row: {
          completed_at: string | null
          created_by: string
          id: string
          notes: string | null
          session_name: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_by: string
          id?: string
          notes?: string | null
          session_name: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_by?: string
          id?: string
          notes?: string | null
          session_name?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          batch_id: string | null
          bundle_id: string | null
          id: string
          is_bundle: boolean
          order_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          batch_id?: string | null
          bundle_id?: string | null
          id?: string
          is_bundle?: boolean
          order_id: string
          product_id: string
          quantity: number
        }
        Update: {
          batch_id?: string | null
          bundle_id?: string | null
          id?: string
          is_bundle?: boolean
          order_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          channel_id: string
          created_at: string
          created_by: string | null
          id: string
          order_number: string
          shipped_at: string | null
          status: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_number: string
          shipped_at?: string | null
          status?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_number?: string
          shipped_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          critical_stock_threshold: number
          description: string | null
          id: string
          is_active: boolean
          low_stock_threshold: number
          name: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          critical_stock_threshold?: number
          description?: string | null
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          name: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          critical_stock_threshold?: number
          description?: string | null
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          name?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      returns: {
        Row: {
          claim_deadline: string | null
          claim_status: string
          condition: string
          created_at: string
          id: string
          inspected_at: string | null
          inspected_by: string | null
          notes: string | null
          order_id: string
          return_date: string
        }
        Insert: {
          claim_deadline?: string | null
          claim_status?: string
          condition?: string
          created_at?: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          notes?: string | null
          order_id: string
          return_date?: string
        }
        Update: {
          claim_deadline?: string | null
          claim_status?: string
          condition?: string
          created_at?: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          notes?: string | null
          order_id?: string
          return_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_ledger: {
        Row: {
          batch_id: string
          channel_id: string | null
          created_at: string
          direction: string
          id: string
          movement_type_id: string
          notes: string | null
          opname_session_id: string | null
          order_id: string | null
          quantity: number
          reason_id: string
          recorded_by: string
          return_id: string | null
          stock_after: number
          stock_before: number
        }
        Insert: {
          batch_id: string
          channel_id?: string | null
          created_at?: string
          direction: string
          id?: string
          movement_type_id: string
          notes?: string | null
          opname_session_id?: string | null
          order_id?: string | null
          quantity: number
          reason_id: string
          recorded_by: string
          return_id?: string | null
          stock_after: number
          stock_before: number
        }
        Update: {
          batch_id?: string
          channel_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          movement_type_id?: string
          notes?: string | null
          opname_session_id?: string | null
          order_id?: string | null
          quantity?: number
          reason_id?: string
          recorded_by?: string
          return_id?: string | null
          stock_after?: number
          stock_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_movement_type_id_fkey"
            columns: ["movement_type_id"]
            isOneToOne: false
            referencedRelation: "movement_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_opname_session_id_fkey"
            columns: ["opname_session_id"]
            isOneToOne: false
            referencedRelation: "opname_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "movement_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      promo_rules: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_rule_conditions: {
        Row: {
          id: string
          product_id: string
          promo_rule_id: string
          quantity: number
        }
        Insert: {
          id?: string
          product_id: string
          promo_rule_id: string
          quantity?: number
        }
        Update: {
          id?: string
          product_id?: string
          promo_rule_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_rule_conditions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_rule_conditions_promo_rule_id_fkey"
            columns: ["promo_rule_id"]
            isOneToOne: false
            referencedRelation: "promo_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_rule_freebies: {
        Row: {
          id: string
          product_id: string
          promo_rule_id: string
          quantity: number
        }
        Insert: {
          id?: string
          product_id: string
          promo_rule_id: string
          quantity?: number
        }
        Update: {
          id?: string
          product_id?: string
          promo_rule_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_rule_freebies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_rule_freebies_promo_rule_id_fkey"
            columns: ["promo_rule_id"]
            isOneToOne: false
            referencedRelation: "promo_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_rule_channels: {
        Row: {
          channel_code: string
          id: string
          promo_rule_id: string
        }
        Insert: {
          channel_code: string
          id?: string
          promo_rule_id: string
        }
        Update: {
          channel_code?: string
          id?: string
          promo_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_rule_channels_channel_code_fkey"
            columns: ["channel_code"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "promo_rule_channels_promo_rule_id_fkey"
            columns: ["promo_rule_id"]
            isOneToOne: false
            referencedRelation: "promo_rules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_batch_fefo: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: {
          batch_id: string
          qty: number
        }[]
      }
      apply_opname_correction: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      daily_consistency_check: {
        Args: never
        Returns: {
          batch_id: string
          batch_number: string
          diff: number
          expected_stock: number
          product_name: string
          recorded_stock: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_cancellation: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      process_return: {
        Args: { p_condition: string; p_notes?: string; p_return_id: string }
        Returns: undefined
      }
      process_shipment: { Args: { p_order_id: string }; Returns: undefined }
      record_stock_movement: {
        Args: {
          p_batch_id: string
          p_channel_code?: string
          p_movement_type: string
          p_notes?: string
          p_opname_session_id?: string
          p_order_id?: string
          p_quantity?: number
          p_reason_code: string
          p_return_id?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "operator"
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
      app_role: ["admin", "manager", "operator"],
    },
  },
} as const
