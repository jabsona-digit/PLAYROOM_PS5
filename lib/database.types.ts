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
      ai_usage_log: {
        Row: {
          candidates_tokens: number
          created_at: string
          id: number
          model: string
          org_id: string | null
          prompt_tokens: number
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          candidates_tokens?: number
          created_at?: string
          id?: never
          model: string
          org_id?: string | null
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          candidates_tokens?: number
          created_at?: string
          id?: never
          model?: string
          org_id?: string | null
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string | null
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id?: string | null
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string | null
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          org_id: string | null
          payload: Json | null
          venue_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: number
          org_id?: string | null
          payload?: Json | null
          venue_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: number
          org_id?: string | null
          payload?: Json | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "audit_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_categories: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          org_id: string
          parent_id: number | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          name: string
          org_id: string
          parent_id?: number | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          name?: string
          org_id?: string
          parent_id?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bar_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "bar_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_products: {
        Row: {
          barcode: string | null
          category_id: number | null
          cost_price: number
          created_at: string
          id: number
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number
          name: string
          org_id: string
          price: number
          stock_quantity: number
        }
        Insert: {
          barcode?: string | null
          category_id?: number | null
          cost_price?: number
          created_at?: string
          id?: number
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name: string
          org_id: string
          price: number
          stock_quantity?: number
        }
        Update: {
          barcode?: string | null
          category_id?: number | null
          cost_price?: number
          created_at?: string
          id?: number
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name?: string
          org_id?: string
          price?: number
          stock_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "bar_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "bar_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_sale_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          name: string
          org_id: string
          product_id: number | null
          qty: number
          sale_id: string
          unit_cost_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          name: string
          org_id: string
          product_id?: number | null
          qty: number
          sale_id: string
          unit_cost_price?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          name?: string
          org_id?: string
          product_id?: number | null
          qty?: number
          sale_id?: string
          unit_cost_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "bar_sale_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sale_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bar_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "bar_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_sales: {
        Row: {
          bank: string | null
          created_at: string
          created_by: number | null
          created_by_user: string | null
          customer_name: string | null
          id: string
          org_id: string
          payment_method: string
          session_id: string | null
          source: string
          tip_amount: number
          total: number
          venue_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          bank?: string | null
          created_at?: string
          created_by?: number | null
          created_by_user?: string | null
          customer_name?: string | null
          id?: string
          org_id: string
          payment_method?: string
          session_id?: string | null
          source?: string
          tip_amount?: number
          total?: number
          venue_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          bank?: string | null
          created_at?: string
          created_by?: number | null
          created_by_user?: string | null
          customer_name?: string | null
          id?: string
          org_id?: string
          payment_method?: string
          session_id?: string | null
          source?: string
          tip_amount?: number
          total?: number
          venue_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sales_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_revenue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sales_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "bar_sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawers: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          difference: number | null
          expected_cash: number | null
          id: string
          note: string | null
          opened_at: string
          opened_by: string | null
          opening_cash: number
          org_id: string
          status: string
          venue_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_cash?: number
          org_id: string
          status?: string
          venue_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_cash?: number
          org_id?: string
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "cash_drawers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliations: {
        Row: {
          actual_cash: number
          created_at: string
          discrepancy: number | null
          expected_cash: number
          id: string
          note: string | null
          org_id: string
          period_from: string
          period_to: string
          reconciled_by: string | null
          shift_id: string | null
          venue_id: string
        }
        Insert: {
          actual_cash: number
          created_at?: string
          discrepancy?: number | null
          expected_cash: number
          id?: string
          note?: string | null
          org_id: string
          period_from: string
          period_to: string
          reconciled_by?: string | null
          shift_id?: string | null
          venue_id: string
        }
        Update: {
          actual_cash?: number
          created_at?: string
          discrepancy?: number | null
          expected_cash?: number
          id?: string
          note?: string | null
          org_id?: string
          period_from?: string
          period_to?: string
          reconciled_by?: string | null
          shift_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "cash_reconciliations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      console_hardware: {
        Row: {
          config: Json
          console_id: number
          control_mode: string
          created_at: string
          desired_state: string | null
          driver: string
          id: string
          is_active: boolean
          last_command: string | null
          last_command_at: string | null
          last_known_state: string
          last_seen_at: string | null
          off_delay_seconds: number
          org_id: string
          secret_ref: string | null
          target: string
          venue_id: string
        }
        Insert: {
          config?: Json
          console_id: number
          control_mode?: string
          created_at?: string
          desired_state?: string | null
          driver?: string
          id?: string
          is_active?: boolean
          last_command?: string | null
          last_command_at?: string | null
          last_known_state?: string
          last_seen_at?: string | null
          off_delay_seconds?: number
          org_id: string
          secret_ref?: string | null
          target?: string
          venue_id: string
        }
        Update: {
          config?: Json
          console_id?: number
          control_mode?: string
          created_at?: string
          desired_state?: string | null
          driver?: string
          id?: string
          is_active?: boolean
          last_command?: string | null
          last_command_at?: string | null
          last_known_state?: string
          last_seen_at?: string | null
          off_delay_seconds?: number
          org_id?: string
          secret_ref?: string | null
          target?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "console_hardware_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: true
            referencedRelation: "console_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "console_hardware_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: true
            referencedRelation: "consoles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "console_hardware_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "console_hardware_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "console_hardware_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "console_hardware_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "console_hardware_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      consoles: {
        Row: {
          asset_label: string | null
          console_type: string
          controller_replaced_at: string | null
          created_at: string
          deleted_at: string | null
          hardware_health_score: number | null
          hours_since_service: number
          id: number
          name: string
          org_id: string
          slot_number: number
          status: string
          total_hours_played: number
          total_sessions_count: number
          venue_id: string
        }
        Insert: {
          asset_label?: string | null
          console_type?: string
          controller_replaced_at?: string | null
          created_at?: string
          deleted_at?: string | null
          hardware_health_score?: number | null
          hours_since_service?: number
          id?: number
          name: string
          org_id: string
          slot_number: number
          status?: string
          total_hours_played?: number
          total_sessions_count?: number
          venue_id: string
        }
        Update: {
          asset_label?: string | null
          console_type?: string
          controller_replaced_at?: string | null
          created_at?: string
          deleted_at?: string | null
          hardware_health_score?: number | null
          hours_since_service?: number
          id?: number
          name?: string
          org_id?: string
          slot_number?: number
          status?: string
          total_hours_played?: number
          total_sessions_count?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consoles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consoles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consoles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "consoles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consoles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credits: {
        Row: {
          code: string | null
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          minutes: number
          minutes_used: number
          note: string | null
          org_id: string
          source: string
          status: string
          tournament_id: string | null
          venue_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          minutes: number
          minutes_used?: number
          note?: string | null
          org_id: string
          source?: string
          status?: string
          tournament_id?: string | null
          venue_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          minutes?: number
          minutes_used?: number
          note?: string | null
          org_id?: string
          source?: string
          status?: string
          tournament_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "customer_credits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          deleted_at: string | null
          discount_pct: number
          id: string
          marketplace_customer_id: string | null
          name: string
          org_id: string
          phone: string | null
          points: number
          total_spent: number
          visit_count: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          discount_pct?: number
          id?: string
          marketplace_customer_id?: string | null
          name: string
          org_id: string
          phone?: string | null
          points?: number
          total_spent?: number
          visit_count?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          discount_pct?: number
          id?: string
          marketplace_customer_id?: string | null
          name?: string
          org_id?: string
          phone?: string | null
          points?: number
          total_spent?: number
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_marketplace_fk"
            columns: ["marketplace_customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_pricing_rules: {
        Row: {
          created_at: string
          days_of_week: number[]
          id: string
          is_active: boolean
          multiplier: number
          name: string
          occupancy_max: number | null
          occupancy_min: number | null
          org_id: string
          priority: number
          rule_type: string
          time_from: string | null
          time_to: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          id?: string
          is_active?: boolean
          multiplier?: number
          name: string
          occupancy_max?: number | null
          occupancy_min?: number | null
          org_id: string
          priority?: number
          rule_type?: string
          time_from?: string | null
          time_to?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          id?: string
          is_active?: boolean
          multiplier?: number
          name?: string
          occupancy_max?: number | null
          occupancy_min?: number | null
          org_id?: string
          priority?: number
          rule_type?: string
          time_from?: string | null
          time_to?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_pricing_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dynamic_pricing_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dynamic_pricing_rules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "dynamic_pricing_rules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dynamic_pricing_rules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_error_log: {
        Row: {
          context: Json
          created_at: string
          fn: string
          id: number
          message: string
        }
        Insert: {
          context?: Json
          created_at?: string
          fn: string
          id?: never
          message: string
        }
        Update: {
          context?: Json
          created_at?: string
          fn?: string
          id?: never
          message?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          org_id: string
          pin_hash: string
          role: string
          salary_amount: number
          salary_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          name: string
          org_id: string
          pin_hash: string
          role?: string
          salary_amount?: number
          salary_type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          name?: string
          org_id?: string
          pin_hash?: string
          role?: string
          salary_amount?: number
          salary_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          org_id: string
          vat_amount: number
          venue_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          org_id: string
          vat_amount?: number
          venue_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          org_id?: string
          vat_amount?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "expenses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      hardware_credentials: {
        Row: {
          created_at: string
          id: string
          org_id: string
          provider: string
          secret_ref: string | null
          server: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          provider: string
          secret_ref?: string | null
          server?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          provider?: string
          secret_ref?: string | null
          server?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hardware_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hardware_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hardware_credentials_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "hardware_credentials_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hardware_credentials_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          line_total: number
          qty: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          line_total?: number
          qty?: number
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          qty?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_address: string | null
          client_email: string | null
          client_name: string
          client_tin: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issued_at: string
          notes: string | null
          org_id: string
          paid_at: string | null
          status: string
          subtotal: number
          total_amount: number
          vat_total: number
          venue_id: string | null
        }
        Insert: {
          client_address?: string | null
          client_email?: string | null
          client_name: string
          client_tin?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          vat_total?: number
          venue_id?: string | null
        }
        Update: {
          client_address?: string | null
          client_email?: string | null
          client_name?: string
          client_tin?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          vat_total?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "invoices_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_bookings: {
        Row: {
          checked_in_at: string | null
          commission_amount: number
          console_id: number | null
          console_type: string
          controllers: number
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          deposit_amount: number
          duration_min: number
          id: string
          notes: string | null
          org_id: string
          paid_at: string | null
          party_size: number | null
          payment_method: string
          payment_ref: string | null
          payment_status: string
          pricing_plan_id: number | null
          reminder_channel: string | null
          reminder_sent_at: string | null
          reservation_id: string | null
          start_time: string
          status: string
          total_amount: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          checked_in_at?: string | null
          commission_amount?: number
          console_id?: number | null
          console_type?: string
          controllers?: number
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          deposit_amount?: number
          duration_min: number
          id?: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          party_size?: number | null
          payment_method?: string
          payment_ref?: string | null
          payment_status?: string
          pricing_plan_id?: number | null
          reminder_channel?: string | null
          reminder_sent_at?: string | null
          reservation_id?: string | null
          start_time: string
          status?: string
          total_amount?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          checked_in_at?: string | null
          commission_amount?: number
          console_id?: number | null
          console_type?: string
          controllers?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          deposit_amount?: number
          duration_min?: number
          id?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          party_size?: number | null
          payment_method?: string
          payment_ref?: string | null
          payment_status?: string
          pricing_plan_id?: number | null
          reminder_channel?: string | null
          reminder_sent_at?: string | null
          reservation_id?: string | null
          start_time?: string
          status?: string
          total_amount?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_bookings_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "console_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "consoles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_pricing_plan_id_fkey"
            columns: ["pricing_plan_id"]
            isOneToOne: false
            referencedRelation: "pricing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_pricing_plan_id_fkey"
            columns: ["pricing_plan_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "marketplace_bookings_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "marketplace_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_customers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          referral_code: string | null
          referred_by: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_customers_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reviews: {
        Row: {
          booking_id: string | null
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          org_id: string
          rating: number
          reply: string | null
          venue_id: string
        }
        Insert: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          org_id: string
          rating: number
          reply?: string | null
          venue_id: string
        }
        Update: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          org_id?: string
          rating?: number
          reply?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "marketplace_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "marketplace_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string
          id: string
          kind: string
          recipient: string | null
          request_id: number | null
          status: string | null
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string
          id?: string
          kind: string
          recipient?: string | null
          request_id?: number | null
          status?: string | null
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string
          id?: string
          kind?: string
          recipient?: string | null
          request_id?: number | null
          status?: string | null
        }
        Relationships: []
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      org_payment_credentials: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_tested_at: string | null
          merchant_id: string | null
          org_id: string
          provider: string
          secret_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_tested_at?: string | null
          merchant_id?: string | null
          org_id: string
          provider: string
          secret_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_tested_at?: string | null
          merchant_id?: string | null
          org_id?: string
          provider?: string
          secret_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_payment_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payment_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          identification_code: string | null
          name: string
          plan: string
          slug: string | null
          subscription_status: string
          telegram_alerts: Json
          telegram_chat_id: number | null
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          identification_code?: string | null
          name: string
          plan?: string
          slug?: string | null
          subscription_status?: string
          telegram_alerts?: Json
          telegram_chat_id?: number | null
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          identification_code?: string | null
          name?: string
          plan?: string
          slug?: string | null
          subscription_status?: string
          telegram_alerts?: Json
          telegram_chat_id?: number | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      payroll_runs: {
        Row: {
          created_at: string
          employees_paid: number
          id: string
          org_id: string
          period_from: string
          period_to: string
          run_by: string | null
          total_paid: number
          venue_id: string
        }
        Insert: {
          created_at?: string
          employees_paid?: number
          id?: string
          org_id: string
          period_from: string
          period_to: string
          run_by?: string | null
          total_paid?: number
          venue_id: string
        }
        Update: {
          created_at?: string
          employees_paid?: number
          id?: string
          org_id?: string
          period_from?: string
          period_to?: string
          run_by?: string | null
          total_paid?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "payroll_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_payments: {
        Row: {
          amount: number
          id: string
          method: string
          months: number
          note: string | null
          org_id: string
          paid_at: string
          period_end: string
          period_start: string
          plan: string | null
          recorded_by: string | null
        }
        Insert: {
          amount?: number
          id?: string
          method?: string
          months?: number
          note?: string | null
          org_id: string
          paid_at?: string
          period_end: string
          period_start: string
          plan?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          id?: string
          method?: string
          months?: number
          note?: string | null
          org_id?: string
          paid_at?: string
          period_end?: string
          period_start?: string
          plan?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_telegram_config: {
        Row: {
          alerts: Json
          chat_id: number | null
          id: number
          updated_at: string | null
        }
        Insert: {
          alerts?: Json
          chat_id?: number | null
          id?: number
          updated_at?: string | null
        }
        Update: {
          alerts?: Json
          chat_id?: number | null
          id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_uptime_state: {
        Row: {
          down_since: string | null
          fail_streak: number
          is_down: boolean
          last_checked_at: string | null
          last_request_id: number | null
          last_status: number | null
          updated_at: string | null
          url: string
        }
        Insert: {
          down_since?: string | null
          fail_streak?: number
          is_down?: boolean
          last_checked_at?: string | null
          last_request_id?: number | null
          last_status?: number | null
          updated_at?: string | null
          url: string
        }
        Update: {
          down_since?: string | null
          fail_streak?: number
          is_down?: boolean
          last_checked_at?: string | null
          last_request_id?: number | null
          last_status?: number | null
          updated_at?: string | null
          url?: string
        }
        Relationships: []
      }
      power_events: {
        Row: {
          action: string
          console_id: number
          created_at: string
          error_msg: string | null
          id: number
          operator_id: string | null
          org_id: string
          session_id: string | null
          success: boolean
          triggered_by: string
          venue_id: string
        }
        Insert: {
          action: string
          console_id: number
          created_at?: string
          error_msg?: string | null
          id?: number
          operator_id?: string | null
          org_id: string
          session_id?: string | null
          success?: boolean
          triggered_by: string
          venue_id: string
        }
        Update: {
          action?: string
          console_id?: number
          created_at?: string
          error_msg?: string | null
          id?: number
          operator_id?: string | null
          org_id?: string
          session_id?: string | null
          success?: boolean
          triggered_by?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "power_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_revenue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "power_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_plans: {
        Row: {
          category: string | null
          console_type: string | null
          controllers: number
          id: number
          is_active: boolean
          name: string
          org_id: string
          price_per_hour: number
          type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          console_type?: string | null
          controllers?: number
          id?: number
          is_active?: boolean
          name: string
          org_id: string
          price_per_hour: number
          type: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          console_type?: string | null
          controllers?: number
          id?: number
          is_active?: boolean
          name?: string
          org_id?: string
          price_per_hour?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_earnings: {
        Row: {
          amount: number
          created_at: string
          id: number
          org_id: string | null
          referee_id: string
          referrer_id: string
          session_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: never
          org_id?: string | null
          referee_id: string
          referrer_id: string
          session_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: never
          org_id?: string | null
          referee_id?: string
          referrer_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_earnings_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "session_revenue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          console_id: number | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          duration_min: number
          id: string
          notes: string | null
          org_id: string
          session_id: string | null
          start_time: string
          status: string
          venue_id: string
        }
        Insert: {
          console_id?: number | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          duration_min: number
          id?: string
          notes?: string | null
          org_id: string
          session_id?: string | null
          start_time: string
          status?: string
          venue_id: string
        }
        Update: {
          console_id?: number | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          duration_min?: number
          id?: string
          notes?: string | null
          org_id?: string
          session_id?: string | null
          start_time?: string
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "console_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "consoles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_revenue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "reservations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          console_id: number
          created_at: string
          id: string
          items: Json
          kind: string
          org_id: string
          resolved_at: string | null
          resolved_by: string | null
          sale_id: string | null
          session_id: string | null
          status: string
          total: number
          venue_id: string
        }
        Insert: {
          console_id: number
          created_at?: string
          id?: string
          items?: Json
          kind: string
          org_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          sale_id?: string | null
          session_id?: string | null
          status?: string
          total?: number
          venue_id: string
        }
        Update: {
          console_id?: number
          created_at?: string
          id?: string
          items?: Json
          kind?: string
          org_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sale_id?: string | null
          session_id?: string | null
          status?: string
          total?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "console_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "consoles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "bar_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_revenue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "service_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      session_extensions: {
        Row: {
          bank: string | null
          created_at: string
          extra_minutes: number
          extra_price: number
          id: string
          on_tab: boolean
          org_id: string
          payment_method: string | null
          session_id: string
          settled_at: string | null
        }
        Insert: {
          bank?: string | null
          created_at?: string
          extra_minutes: number
          extra_price: number
          id?: string
          on_tab?: boolean
          org_id: string
          payment_method?: string | null
          session_id: string
          settled_at?: string | null
        }
        Update: {
          bank?: string | null
          created_at?: string
          extra_minutes?: number
          extra_price?: number
          id?: string
          on_tab?: boolean
          org_id?: string
          payment_method?: string | null
          session_id?: string
          settled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_extensions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_extensions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_extensions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_revenue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_extensions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          bank: string | null
          console_id: number
          created_at: string
          created_by: number | null
          created_by_user: string | null
          credit_discount: number
          credit_id: string | null
          credit_minutes: number
          customer_id: string | null
          customer_name: string | null
          duration_min: number | null
          ended_at: string | null
          ends_at: string | null
          id: string
          is_open: boolean
          notified_10: boolean
          notified_5: boolean
          org_id: string
          payment_method: string
          portal_code: string | null
          price_per_hour: number
          price_total: number
          pricing_plan_id: number
          refund_amount: number | null
          refund_reason: string | null
          refunded_at: string | null
          started_at: string
          status: string
          tip_amount: number
          venue_id: string
        }
        Insert: {
          bank?: string | null
          console_id: number
          created_at?: string
          created_by?: number | null
          created_by_user?: string | null
          credit_discount?: number
          credit_id?: string | null
          credit_minutes?: number
          customer_id?: string | null
          customer_name?: string | null
          duration_min?: number | null
          ended_at?: string | null
          ends_at?: string | null
          id?: string
          is_open?: boolean
          notified_10?: boolean
          notified_5?: boolean
          org_id: string
          payment_method?: string
          portal_code?: string | null
          price_per_hour: number
          price_total: number
          pricing_plan_id: number
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          started_at?: string
          status?: string
          tip_amount?: number
          venue_id: string
        }
        Update: {
          bank?: string | null
          console_id?: number
          created_at?: string
          created_by?: number | null
          created_by_user?: string | null
          credit_discount?: number
          credit_id?: string | null
          credit_minutes?: number
          customer_id?: string | null
          customer_name?: string | null
          duration_min?: number | null
          ended_at?: string | null
          ends_at?: string | null
          id?: string
          is_open?: boolean
          notified_10?: boolean
          notified_5?: boolean
          org_id?: string
          payment_method?: string
          portal_code?: string | null
          price_per_hour?: number
          price_total?: number
          pricing_plan_id?: number
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          started_at?: string
          status?: string
          tip_amount?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "console_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "consoles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_pricing_plan_id_fkey"
            columns: ["pricing_plan_id"]
            isOneToOne: false
            referencedRelation: "pricing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_pricing_plan_id_fkey"
            columns: ["pricing_plan_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          clock_in: string
          clock_out: string | null
          employee_id: number
          hours_worked: number | null
          id: string
          notes: string | null
          org_id: string
          venue_id: string
          work_date: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          employee_id: number
          hours_worked?: number | null
          id?: string
          notes?: string | null
          org_id: string
          venue_id: string
          work_date?: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          employee_id?: number
          hours_worked?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          venue_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "shifts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          org_id: string | null
          scope: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          org_id?: string | null
          scope?: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          org_id?: string | null
          scope?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_link_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_rate_limit: {
        Row: {
          chat_id: number
          count: number
          window_start: string
        }
        Insert: {
          chat_id: number
          count?: number
          window_start?: string
        }
        Update: {
          chat_id?: number
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      tournament_groups: {
        Row: {
          created_at: string
          id: string
          label: string
          org_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          org_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          org_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_host_offers: {
        Row: {
          agreed_amount: number | null
          created_at: string
          id: string
          note: string | null
          org_id: string
          proposed_amount: number | null
          status: string
          tournament_id: string
          venue_id: string
        }
        Insert: {
          agreed_amount?: number | null
          created_at?: string
          id?: string
          note?: string | null
          org_id: string
          proposed_amount?: number | null
          status?: string
          tournament_id: string
          venue_id: string
        }
        Update: {
          agreed_amount?: number | null
          created_at?: string
          id?: string
          note?: string | null
          org_id?: string
          proposed_amount?: number | null
          status?: string
          tournament_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_host_offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_host_offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_host_offers_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_host_offers_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_host_offers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "tournament_host_offers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_host_offers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          console_id: number | null
          created_at: string
          group_id: string | null
          id: string
          next_match_id: string | null
          next_slot: number | null
          org_id: string
          p1_id: string | null
          p2_id: string | null
          position: number | null
          round: number | null
          score1: number | null
          score2: number | null
          stage: string
          status: string
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          console_id?: number | null
          created_at?: string
          group_id?: string | null
          id?: string
          next_match_id?: string | null
          next_slot?: number | null
          org_id: string
          p1_id?: string | null
          p2_id?: string | null
          position?: number | null
          round?: number | null
          score1?: number | null
          score2?: number | null
          stage?: string
          status?: string
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          console_id?: number | null
          created_at?: string
          group_id?: string | null
          id?: string
          next_match_id?: string | null
          next_slot?: number | null
          org_id?: string
          p1_id?: string | null
          p2_id?: string | null
          position?: number | null
          round?: number | null
          score1?: number | null
          score2?: number | null
          stage?: string
          status?: string
          tournament_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "console_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "consoles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_p1_id_fkey"
            columns: ["p1_id"]
            isOneToOne: false
            referencedRelation: "tournament_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_p2_id_fkey"
            columns: ["p2_id"]
            isOneToOne: false
            referencedRelation: "tournament_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "tournament_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_participants: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          name: string
          org_id: string
          phone: string | null
          tournament_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          name: string
          org_id: string
          phone?: string | null
          tournament_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_payouts: {
        Row: {
          amount: number
          created_at: string
          credit_id: string | null
          customer_id: string | null
          expense_id: string | null
          id: string
          manual: boolean
          minutes: number
          org_id: string
          participant_id: string | null
          place: number
          prize_type: string
          tournament_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          credit_id?: string | null
          customer_id?: string | null
          expense_id?: string | null
          id?: string
          manual?: boolean
          minutes?: number
          org_id: string
          participant_id?: string | null
          place: number
          prize_type: string
          tournament_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_id?: string | null
          customer_id?: string | null
          expense_id?: string | null
          id?: string
          manual?: boolean
          minutes?: number
          org_id?: string
          participant_id?: string | null
          place?: number
          prize_type?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_payouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_payouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_payouts_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_payouts_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          checked_in_at: string | null
          created_at: string
          customer_id: string
          display_name: string
          email: string | null
          id: string
          paid_amount: number | null
          paid_at: string | null
          paid_method: string | null
          participant_id: string | null
          phone: string | null
          sale_id: string | null
          status: string
          tournament_id: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          customer_id: string
          display_name: string
          email?: string | null
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_method?: string | null
          participant_id?: string | null
          phone?: string | null
          sale_id?: string | null
          status?: string
          tournament_id: string
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string
          customer_id?: string
          display_name?: string
          email?: string | null
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_method?: string | null
          participant_id?: string | null
          phone?: string | null
          sale_id?: string | null
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          advance_per_group: number
          agreed_amount: number | null
          bracket_size: number | null
          commission_pct: number
          created_at: string
          creator_scope: string
          entry_fee: number
          format: string
          game: string | null
          group_size: number
          host_org_id: string | null
          id: string
          is_public: boolean
          max_participants: number | null
          min_participants: number | null
          name: string
          org_id: string | null
          phase: string | null
          prize_pool: number
          prize_second: number
          prize_third_minutes: number
          prizes_awarded_at: string | null
          promoted_at: string | null
          promotion_status: string | null
          proposed_commission_pct: number | null
          rejected_reason: string | null
          starts_at: string | null
          status: string
          venue_id: string | null
          winner_participant_id: string | null
        }
        Insert: {
          advance_per_group?: number
          agreed_amount?: number | null
          bracket_size?: number | null
          commission_pct?: number
          created_at?: string
          creator_scope?: string
          entry_fee?: number
          format?: string
          game?: string | null
          group_size?: number
          host_org_id?: string | null
          id?: string
          is_public?: boolean
          max_participants?: number | null
          min_participants?: number | null
          name: string
          org_id?: string | null
          phase?: string | null
          prize_pool?: number
          prize_second?: number
          prize_third_minutes?: number
          prizes_awarded_at?: string | null
          promoted_at?: string | null
          promotion_status?: string | null
          proposed_commission_pct?: number | null
          rejected_reason?: string | null
          starts_at?: string | null
          status?: string
          venue_id?: string | null
          winner_participant_id?: string | null
        }
        Update: {
          advance_per_group?: number
          agreed_amount?: number | null
          bracket_size?: number | null
          commission_pct?: number
          created_at?: string
          creator_scope?: string
          entry_fee?: number
          format?: string
          game?: string | null
          group_size?: number
          host_org_id?: string | null
          id?: string
          is_public?: boolean
          max_participants?: number | null
          min_participants?: number | null
          name?: string
          org_id?: string | null
          phase?: string | null
          prize_pool?: number
          prize_second?: number
          prize_third_minutes?: number
          prizes_awarded_at?: string | null
          promoted_at?: string | null
          promotion_status?: string | null
          proposed_commission_pct?: number | null
          rejected_reason?: string | null
          starts_at?: string | null
          status?: string
          venue_id?: string | null
          winner_participant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_host_org_id_fkey"
            columns: ["host_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_host_org_id_fkey"
            columns: ["host_org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "tournaments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_winner_fkey"
            columns: ["winner_participant_id"]
            isOneToOne: false
            referencedRelation: "tournament_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_budgets: {
        Row: {
          created_at: string
          expense_budget: number | null
          id: string
          month: string
          note: string | null
          org_id: string
          revenue_target: number | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          expense_budget?: number | null
          id?: string
          month: string
          note?: string | null
          org_id: string
          revenue_target?: number | null
          venue_id: string
        }
        Update: {
          created_at?: string
          expense_budget?: number | null
          id?: string
          month?: string
          note?: string | null
          org_id?: string
          revenue_target?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          amenities: Json
          avg_rating: number
          city: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          fiscal_address: string | null
          fiscal_business_name: string | null
          fiscal_enabled: boolean
          fiscal_tin: string | null
          gallery: Json
          hardware_required: boolean
          id: string
          is_active: boolean
          is_published: boolean
          is_vat_registered: boolean
          lat: number | null
          lng: number | null
          name: string
          opening_hours: Json | null
          org_id: string
          public_phone: string | null
          review_count: number
          slug: string | null
          venue_config: Json
          venue_type: string
        }
        Insert: {
          address?: string | null
          amenities?: Json
          avg_rating?: number
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          fiscal_address?: string | null
          fiscal_business_name?: string | null
          fiscal_enabled?: boolean
          fiscal_tin?: string | null
          gallery?: Json
          hardware_required?: boolean
          id?: string
          is_active?: boolean
          is_published?: boolean
          is_vat_registered?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          opening_hours?: Json | null
          org_id: string
          public_phone?: string | null
          review_count?: number
          slug?: string | null
          venue_config?: Json
          venue_type?: string
        }
        Update: {
          address?: string | null
          amenities?: Json
          avg_rating?: number
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          fiscal_address?: string | null
          fiscal_business_name?: string | null
          fiscal_enabled?: boolean
          fiscal_tin?: string | null
          gallery?: Json
          hardware_required?: boolean
          id?: string
          is_active?: boolean
          is_published?: boolean
          is_vat_registered?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          opening_hours?: Json | null
          org_id?: string
          public_phone?: string | null
          review_count?: number
          slug?: string | null
          venue_config?: Json
          venue_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      budget_vs_actual: {
        Row: {
          actual_expense: number | null
          actual_profit: number | null
          actual_revenue: number | null
          expense_budget: number | null
          expense_pct: number | null
          month: string | null
          org_id: string | null
          revenue_pct: number | null
          revenue_target: number | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_org_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      console_stats: {
        Row: {
          id: number | null
          name: string | null
          slot_number: number | null
          status: string | null
          total_hours: number | null
          total_revenue: number | null
          total_sessions: number | null
        }
        Relationships: []
      }
      daily_revenue: {
        Row: {
          hours_today: number | null
          name: string | null
          revenue_today: number | null
          sessions_today: number | null
          slot_number: number | null
        }
        Relationships: []
      }
      monthly_pnl: {
        Row: {
          bar_cogs: number | null
          bar_revenue: number | null
          bar_tips: number | null
          month: string | null
          net_profit: number | null
          org_id: string | null
          session_refunds: number | null
          session_revenue: number | null
          session_tips: number | null
          total_expenses: number | null
          venue_id: string | null
        }
        Relationships: []
      }
      period_revenue: {
        Row: {
          all_time: number | null
          this_month: number | null
          this_week: number | null
          today: number | null
        }
        Relationships: []
      }
      platform_org_overview: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          id: string | null
          last_payment_at: string | null
          member_count: number | null
          monthly_amount: number | null
          name: string | null
          plan: string | null
          subscription_status: string | null
          total_paid: number | null
          total_revenue: number | null
          trial_ends_at: string | null
          venue_count: number | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string | null
          last_payment_at?: never
          member_count?: never
          monthly_amount?: never
          name?: string | null
          plan?: string | null
          subscription_status?: string | null
          total_paid?: never
          total_revenue?: never
          trial_ends_at?: string | null
          venue_count?: never
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string | null
          last_payment_at?: never
          member_count?: never
          monthly_amount?: never
          name?: string | null
          plan?: string | null
          subscription_status?: string | null
          total_paid?: never
          total_revenue?: never
          trial_ends_at?: string | null
          venue_count?: never
        }
        Relationships: []
      }
      public_reviews: {
        Row: {
          author: string | null
          comment: string | null
          created_at: string | null
          id: string | null
          rating: number | null
          reply: string | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "marketplace_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "public_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      public_tournaments: {
        Row: {
          advance_per_group: number | null
          entry_fee: number | null
          format: string | null
          game: string | null
          group_size: number | null
          id: string | null
          max_participants: number | null
          min_participants: number | null
          name: string | null
          participant_count: number | null
          prize_pool: number | null
          prize_second: number | null
          prize_third_minutes: number | null
          starts_at: string | null
          status: string | null
          venue_city: string | null
          venue_cover: string | null
          venue_name: string | null
          venue_slug: string | null
          venue_type: string | null
        }
        Relationships: []
      }
      public_venue_plans: {
        Row: {
          category: string | null
          console_type: string | null
          controllers: number | null
          name: string | null
          plan_id: number | null
          price_per_hour: number | null
          type: string | null
          venue_id: string | null
          venue_slug: string | null
        }
        Relationships: []
      }
      public_venues: {
        Row: {
          address: string | null
          amenities: Json | null
          avg_rating: number | null
          city: string | null
          cover_image_url: string | null
          description: string | null
          gallery: Json | null
          id: string | null
          lat: number | null
          lng: number | null
          name: string | null
          opening_hours: Json | null
          price_from: number | null
          public_phone: string | null
          review_count: number | null
          slug: string | null
          venue_type: string | null
        }
        Insert: {
          address?: string | null
          amenities?: Json | null
          avg_rating?: number | null
          city?: string | null
          cover_image_url?: string | null
          description?: string | null
          gallery?: Json | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          opening_hours?: Json | null
          price_from?: never
          public_phone?: string | null
          review_count?: number | null
          slug?: string | null
          venue_type?: string | null
        }
        Update: {
          address?: string | null
          amenities?: Json | null
          avg_rating?: number | null
          city?: string | null
          cover_image_url?: string | null
          description?: string | null
          gallery?: Json | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          opening_hours?: Json | null
          price_from?: never
          public_phone?: string | null
          review_count?: number | null
          slug?: string | null
          venue_type?: string | null
        }
        Relationships: []
      }
      session_revenue: {
        Row: {
          console_id: number | null
          created_at: string | null
          created_by: number | null
          customer_name: string | null
          duration_min: number | null
          ended_at: string | null
          ends_at: string | null
          id: string | null
          notified_10: boolean | null
          notified_5: boolean | null
          price_per_hour: number | null
          price_total: number | null
          pricing_plan_id: number | null
          revenue: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          console_id?: number | null
          created_at?: string | null
          created_by?: number | null
          customer_name?: string | null
          duration_min?: number | null
          ended_at?: string | null
          ends_at?: string | null
          id?: string | null
          notified_10?: boolean | null
          notified_5?: boolean | null
          price_per_hour?: number | null
          price_total?: number | null
          pricing_plan_id?: number | null
          revenue?: never
          started_at?: string | null
          status?: string | null
        }
        Update: {
          console_id?: number | null
          created_at?: string | null
          created_by?: number | null
          customer_name?: string | null
          duration_min?: number | null
          ended_at?: string | null
          ends_at?: string | null
          id?: string | null
          notified_10?: boolean | null
          notified_5?: boolean | null
          price_per_hour?: number | null
          price_total?: number | null
          pricing_plan_id?: number | null
          revenue?: never
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "console_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_console_id_fkey"
            columns: ["console_id"]
            isOneToOne: false
            referencedRelation: "consoles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_pricing_plan_id_fkey"
            columns: ["pricing_plan_id"]
            isOneToOne: false
            referencedRelation: "pricing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_pricing_plan_id_fkey"
            columns: ["pricing_plan_id"]
            isOneToOne: false
            referencedRelation: "public_venue_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
    }
    Functions: {
      _advance_winner: {
        Args: { p_match: string; p_winner: string }
        Returns: undefined
      }
      _grant_tournament_prize: {
        Args: {
          p_amount: number
          p_minutes: number
          p_org: string
          p_participant: string
          p_place: number
          p_tname: string
          p_tournament: string
          p_type: string
          p_venue: string
        }
        Returns: Json
      }
      accept_host_offer: {
        Args: { p_agreed: number; p_offer: string }
        Returns: undefined
      }
      accept_invite: { Args: { p_token: string }; Returns: Json }
      add_expense: {
        Args: {
          p_amount: number
          p_category: string
          p_description?: string
          p_expense_date?: string
          p_vat_amount?: number
          p_venue_id: string
        }
        Returns: string
      }
      ai_rate_limit: { Args: { p_limit?: number }; Returns: undefined }
      api_analytics_summary: { Args: { p_org_id: string }; Returns: Json }
      api_device_heartbeat: { Args: { p_org_id: string }; Returns: Json }
      api_device_list: { Args: { p_org_id: string }; Returns: Json }
      api_device_report: {
        Args: {
          p_console_id: number
          p_error?: string
          p_org_id: string
          p_state: string
          p_success?: boolean
        }
        Returns: Json
      }
      api_list_sessions: {
        Args: { p_limit?: number; p_org_id: string }
        Returns: Json
      }
      apply_credit_to_session: {
        Args: { p_code: string; p_session_id: string }
        Returns: Json
      }
      approve_tournament_promotion: {
        Args: { p_commission: number; p_tournament: string }
        Returns: undefined
      }
      award_tournament_prizes: { Args: { p_tournament: string }; Returns: Json }
      cancel_reservation: {
        Args: { p_reason?: string; p_reservation_id: string }
        Returns: undefined
      }
      cash_expected: {
        Args: {
          p_from: string
          p_opening: number
          p_to: string
          p_venue_id: string
        }
        Returns: number
      }
      cash_opener_name: {
        Args: { p_org: string; p_uid: string }
        Returns: string
      }
      change_session_tier: {
        Args: { p_pricing_plan_id: number; p_session_id: string }
        Returns: Json
      }
      check_venue_availability_for_ai: {
        Args: { p_venue_id: string }
        Returns: Json
      }
      checkin_tournament_registration: {
        Args: { p_amount: number; p_method: string; p_registration: string }
        Returns: Json
      }
      claim_referral: { Args: { p_code: string }; Returns: Json }
      clock_toggle: {
        Args: { p_pin: string; p_venue_id: string }
        Returns: Json
      }
      close_cash_drawer: {
        Args: { p_closing_cash: number; p_note?: string; p_venue_id: string }
        Returns: Json
      }
      compute_session_bill: { Args: { p_session_id: string }; Returns: Json }
      confirm_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      create_api_key: {
        Args: {
          p_expires_at?: string
          p_name: string
          p_org_id?: string
          p_scopes?: string[]
        }
        Returns: Json
      }
      create_bar_sale:
        | {
            Args: {
              p_bank?: string
              p_created_by?: number
              p_customer_name?: string
              p_items?: Json
              p_payment_method: string
              p_session_id?: string
              p_venue_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_bank?: string
              p_created_by?: number
              p_customer_name?: string
              p_items: Json
              p_payment_method: string
              p_session_id?: string
              p_tip?: number
              p_venue_id: string
            }
            Returns: string
          }
      create_employee: {
        Args: {
          p_name: string
          p_org_id: string
          p_pin: string
          p_role: string
        }
        Returns: Json
      }
      create_invite: {
        Args: { p_email: string; p_org: string; p_role: string }
        Returns: Json
      }
      create_marketplace_booking: {
        Args: {
          p_console_id?: number
          p_console_type?: string
          p_controllers?: number
          p_customer_name: string
          p_customer_phone: string
          p_duration_min: number
          p_notes?: string
          p_party_size?: number
          p_payment_method?: string
          p_pricing_plan_id?: number
          p_slug: string
          p_start: string
        }
        Returns: string
      }
      create_organization: {
        Args: {
          p_identification_code?: string
          p_org_name: string
          p_venue_name: string
        }
        Returns: string
      }
      create_platform_telegram_code: { Args: never; Returns: Json }
      create_platform_tournament: {
        Args: {
          p_advance: number
          p_entry_fee: number
          p_format: string
          p_game: string
          p_group_size: number
          p_max: number
          p_name: string
          p_prize_pool: number
          p_starts_at: string
        }
        Returns: string
      }
      create_reservation: {
        Args: {
          p_console_id?: number
          p_customer_name: string
          p_customer_phone?: string
          p_duration_min: number
          p_notes?: string
          p_start_time: string
          p_venue_id: string
        }
        Returns: string
      }
      create_telegram_link_code: { Args: { p_org_id: string }; Returns: Json }
      create_venue: {
        Args: { p_name: string; p_org_id: string; p_venue_type?: string }
        Returns: {
          address: string | null
          amenities: Json
          avg_rating: number
          city: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          fiscal_address: string | null
          fiscal_business_name: string | null
          fiscal_enabled: boolean
          fiscal_tin: string | null
          gallery: Json
          hardware_required: boolean
          id: string
          is_active: boolean
          is_published: boolean
          is_vat_registered: boolean
          lat: number | null
          lng: number | null
          name: string
          opening_hours: Json | null
          org_id: string
          public_phone: string | null
          review_count: number
          slug: string | null
          venue_config: Json
          venue_type: string
        }
        SetofOptions: {
          from: "*"
          to: "venues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_console: { Args: { p_console_id: number }; Returns: undefined }
      delete_customer: { Args: { p_customer_id: string }; Returns: undefined }
      delete_expense: { Args: { p_expense_id: string }; Returns: undefined }
      delete_hardware_credentials: {
        Args: { p_provider: string; p_venue_id: string }
        Returns: Json
      }
      delete_payment_credentials: {
        Args: { p_org_id: string; p_provider: string }
        Returns: Json
      }
      draw_tournament_groups: { Args: { p_tournament: string }; Returns: Json }
      dynamic_price_quote: {
        Args: { p_base: number; p_venue_id: string; p_when?: string }
        Returns: Json
      }
      end_session: {
        Args: { p_session_id: string; p_tip?: number }
        Returns: undefined
      }
      end_shift: { Args: { p_venue_id: string }; Returns: Json }
      extend_session: {
        Args: {
          p_bank?: string
          p_extra_min: number
          p_on_tab?: boolean
          p_payment_method?: string
          p_session_id: string
        }
        Returns: undefined
      }
      get_ai_usage_stats: { Args: { p_days?: number }; Returns: Json }
      get_console_analytics: {
        Args: {
          p_daily_hours?: number
          p_from: string
          p_to: string
          p_venue_id: string
        }
        Returns: Json
      }
      get_daily_brief_data: {
        Args: { p_date?: string; p_venue_id: string }
        Returns: Json
      }
      get_edge_errors: { Args: { p_limit?: number }; Returns: Json }
      get_gamer_passport: { Args: never; Returns: Json }
      get_ghost_power_events: {
        Args: { p_from: string; p_to: string; p_venue_id: string }
        Returns: {
          console_id: number
          operator_id: string
          powered_on_at: string
          triggered_by: string
        }[]
      }
      get_group_standings: { Args: { p_tournament: string }; Returns: Json }
      get_hardware_secret: {
        Args: { p_provider: string; p_venue_id: string }
        Returns: Json
      }
      get_hardware_settings: { Args: { p_venue_id: string }; Returns: Json }
      get_my_credits: { Args: never; Returns: Json }
      get_my_referral: { Args: never; Returns: Json }
      get_my_tournament_registrations: { Args: never; Returns: Json }
      get_open_drawer: { Args: { p_venue_id: string }; Returns: Json }
      get_operator_integrity: {
        Args: {
          p_from?: string
          p_org_id: string
          p_to?: string
          p_venue_id?: string
        }
        Returns: Json
      }
      get_org_overview: {
        Args: {
          p_month: string
          p_org_id: string
          p_today: string
          p_week: string
        }
        Returns: Json
      }
      get_payment_settings: { Args: { p_org_id: string }; Returns: Json }
      get_pulse_stats: { Args: never; Returns: Json }
      get_referral_overview: { Args: { p_days?: number }; Returns: Json }
      get_session_bill: { Args: { p_session_id: string }; Returns: Json }
      get_staff_leaderboard: {
        Args: {
          p_from?: string
          p_org_id: string
          p_to?: string
          p_venue_id?: string
        }
        Returns: Json
      }
      get_tournament_registrations: {
        Args: { p_tournament: string }
        Returns: Json
      }
      get_vat_summary: {
        Args: { p_from: string; p_to: string; p_venue_id: string }
        Returns: Json
      }
      get_venue_availability: {
        Args: { p_date: string; p_slug: string }
        Returns: {
          busy: Json
          capacity: number
          console_type: string
        }[]
      }
      get_venue_consoles: {
        Args: { p_date: string; p_slug: string }
        Returns: {
          busy: Json
          console_id: number
          console_type: string
          name: string
        }[]
      }
      get_venue_pnl: {
        Args: { p_from: string; p_to: string; p_venue_id: string }
        Returns: Json
      }
      identify_by_pin: {
        Args: { p_pin: string; p_venue_id: string }
        Returns: Json
      }
      is_org_accountant: { Args: { p_org: string }; Returns: boolean }
      is_org_admin: { Args: { p_org: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_org_member_raw: { Args: { p_org: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      link_marketplace_customer: {
        Args: { p_marketplace_id: string; p_org: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          discount_pct: number
          id: string
          marketplace_customer_id: string | null
          name: string
          org_id: string
          phone: string | null
          points: number
          total_spent: number
          visit_count: number
        }
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_api_keys: { Args: { p_org_id?: string }; Returns: Json }
      list_hosting_opportunities: { Args: never; Returns: Json }
      list_org_members: {
        Args: { p_org: string }
        Returns: {
          email: string
          joined_at: string
          role: string
          user_id: string
        }[]
      }
      list_platform_tournaments: { Args: never; Returns: Json }
      list_tenant_promotion_requests: { Args: never; Returns: Json }
      log_ai_usage: {
        Args: {
          p_candidates: number
          p_model: string
          p_prompt: number
          p_total: number
        }
        Returns: undefined
      }
      log_audit: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_org_id: string
          p_payload?: Json
          p_venue_id: string
        }
        Returns: undefined
      }
      log_edge_error: {
        Args: { p_context?: Json; p_fn: string; p_message: string }
        Returns: undefined
      }
      log_power_event: {
        Args: {
          p_action: string
          p_console_id: number
          p_error?: string
          p_session_id?: string
          p_success?: boolean
          p_triggered_by: string
        }
        Returns: number
      }
      mark_controller_serviced: {
        Args: { p_console_id: number }
        Returns: undefined
      }
      mark_tenant_paid: {
        Args: {
          p_amount?: number
          p_method?: string
          p_months?: number
          p_note?: string
          p_org: string
        }
        Returns: {
          amount: number
          id: string
          method: string
          months: number
          note: string | null
          org_id: string
          paid_at: string
          period_end: string
          period_start: string
          plan: string | null
          recorded_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_fiscal_receipt_no: { Args: never; Returns: string }
      next_invoice_number: { Args: { p_org_id: string }; Returns: string }
      notify_email: {
        Args: { p_html: string; p_subject: string; p_to: string }
        Returns: number
      }
      notify_platform_telegram: {
        Args: { p_kind: string; p_text: string }
        Returns: undefined
      }
      notify_telegram_org: {
        Args: { p_kind: string; p_org_id: string; p_text: string }
        Returns: undefined
      }
      open_cash_drawer: {
        Args: { p_opening_cash?: number; p_venue_id: string }
        Returns: Json
      }
      org_plan: { Args: { p_org: string }; Returns: string }
      plan_limit: { Args: { p_kind: string; p_plan: string }; Returns: number }
      plan_monthly_price: { Args: { p_plan: string }; Returns: number }
      plan_rank: { Args: { p: string }; Returns: number }
      platform_daily_digest: { Args: never; Returns: undefined }
      platform_telegram_status: { Args: never; Returns: Json }
      platform_uptime_check: { Args: never; Returns: undefined }
      portal_get_bill: {
        Args: { p_code: string; p_console_id: number }
        Returns: Json
      }
      portal_get_menu: { Args: { p_venue_id: string }; Returns: Json }
      portal_get_session_status: {
        Args: { p_console_id: number }
        Returns: Json
      }
      portal_place_order: {
        Args: {
          p_code: string
          p_console_id: number
          p_items: Json
          p_venue_id: string
        }
        Returns: Json
      }
      portal_request_extend: {
        Args: {
          p_bank?: string
          p_code: string
          p_console_id: number
          p_minutes: number
          p_pay?: string
          p_venue_id: string
        }
        Returns: Json
      }
      portal_request_service: {
        Args: {
          p_code: string
          p_console_id: number
          p_kind: string
          p_venue_id: string
        }
        Returns: Json
      }
      portal_unlock: {
        Args: { p_code: string; p_console_id: number; p_venue_id: string }
        Returns: Json
      }
      process_payroll: {
        Args: {
          p_from: string
          p_org_id: string
          p_to: string
          p_venue_id: string
        }
        Returns: Json
      }
      reconcile_shift: {
        Args: {
          p_actual_cash: number
          p_note?: string
          p_shift_id: string
          p_venue_id: string
        }
        Returns: Json
      }
      refund_session: {
        Args: {
          p_reason?: string
          p_refund_amount?: number
          p_session_id: string
        }
        Returns: undefined
      }
      register_for_tournament: {
        Args: {
          p_email: string
          p_name: string
          p_phone: string
          p_tournament: string
        }
        Returns: string
      }
      reject_tournament_promotion: {
        Args: { p_reason: string; p_tournament: string }
        Returns: undefined
      }
      remove_credit_from_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      reply_to_review: {
        Args: { p_id: string; p_reply: string }
        Returns: undefined
      }
      report_match: {
        Args: { p_match: string; p_score1: number; p_score2: number }
        Returns: undefined
      }
      require_plan: {
        Args: { p_min: string; p_org: string }
        Returns: undefined
      }
      resolve_service_request: {
        Args: {
          p_bank?: string
          p_id: string
          p_on_tab?: boolean
          p_payment_method?: string
          p_status?: string
        }
        Returns: Json
      }
      revoke_api_key: { Args: { p_id: string }; Returns: Json }
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined }
      save_hardware_credentials: {
        Args: {
          p_auth_key: string
          p_provider: string
          p_server: string
          p_venue_id: string
        }
        Returns: Json
      }
      save_payment_credentials: {
        Args: {
          p_merchant_id: string
          p_org_id: string
          p_provider: string
          p_secret: Json
        }
        Returns: Json
      }
      search_tournaments_for_ai: { Args: { p_query?: string }; Returns: Json }
      search_venues_for_ai: {
        Args: {
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_query?: string
          p_require_bar?: boolean
          p_require_billiard?: boolean
          p_require_vip?: boolean
        }
        Returns: Json
      }
      seed_group_stage: { Args: { p_tournament: string }; Returns: undefined }
      seed_tournament: { Args: { p_tournament: string }; Returns: undefined }
      send_booking_reminders: { Args: never; Returns: undefined }
      set_console_power: {
        Args: {
          p_action: string
          p_console_id: number
          p_session_id?: string
          p_triggered_by?: string
        }
        Returns: Json
      }
      set_employee_pin: {
        Args: { p_employee_id: number; p_pin: string }
        Returns: undefined
      }
      set_payment_provider_active: {
        Args: { p_active: boolean; p_org_id: string; p_provider: string }
        Returns: Json
      }
      set_telegram_alerts: {
        Args: { p_alerts: Json; p_org_id: string }
        Returns: Json
      }
      set_tournament_commission: {
        Args: { p_pct: number; p_tournament: string }
        Returns: undefined
      }
      settle_session_tab: {
        Args: {
          p_bank?: string
          p_payment_method: string
          p_session_id: string
        }
        Returns: Json
      }
      slugify: { Args: { p: string }; Returns: string }
      start_knockout_from_groups: {
        Args: { p_tournament: string }
        Returns: Json
      }
      start_open_session: {
        Args: {
          p_bank?: string
          p_console_id: number
          p_created_by?: number
          p_customer_id?: string
          p_customer_name?: string
          p_payment_method?: string
          p_plan_id: number
        }
        Returns: {
          bank: string | null
          console_id: number
          created_at: string
          created_by: number | null
          created_by_user: string | null
          credit_discount: number
          credit_id: string | null
          credit_minutes: number
          customer_id: string | null
          customer_name: string | null
          duration_min: number | null
          ended_at: string | null
          ends_at: string | null
          id: string
          is_open: boolean
          notified_10: boolean
          notified_5: boolean
          org_id: string
          payment_method: string
          portal_code: string | null
          price_per_hour: number
          price_total: number
          pricing_plan_id: number
          refund_amount: number | null
          refund_reason: string | null
          refunded_at: string | null
          started_at: string
          status: string
          tip_amount: number
          venue_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_session: {
        Args: {
          p_bank?: string
          p_console_id: number
          p_created_by?: number
          p_customer_id?: string
          p_customer_name?: string
          p_duration_min: number
          p_payment_method?: string
          p_plan_id: number
        }
        Returns: {
          bank: string | null
          console_id: number
          created_at: string
          created_by: number | null
          created_by_user: string | null
          credit_discount: number
          credit_id: string | null
          credit_minutes: number
          customer_id: string | null
          customer_name: string | null
          duration_min: number | null
          ended_at: string | null
          ends_at: string | null
          id: string
          is_open: boolean
          notified_10: boolean
          notified_5: boolean
          org_id: string
          payment_method: string
          portal_code: string | null
          price_per_hour: number
          price_total: number
          pricing_plan_id: number
          refund_amount: number | null
          refund_reason: string | null
          refunded_at: string | null
          started_at: string
          status: string
          tip_amount: number
          venue_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_shift: { Args: { p_venue_id: string }; Returns: Json }
      submit_host_offer: {
        Args: {
          p_note: string
          p_proposed: number
          p_tournament: string
          p_venue_id: string
        }
        Returns: string
      }
      submit_review: {
        Args: { p_booking_id: string; p_comment?: string; p_rating: number }
        Returns: string
      }
      submit_tournament_for_promotion: {
        Args: { p_commission: number; p_tournament: string }
        Returns: undefined
      }
      telegram_link: {
        Args: { p_chat_id: number; p_code: string }
        Returns: Json
      }
      telegram_link_status: { Args: { p_org_id: string }; Returns: Json }
      telegram_nightly_briefs: { Args: never; Returns: undefined }
      telegram_org_summary: { Args: { p_chat_id: number }; Returns: Json }
      telegram_rate_ok: {
        Args: { p_chat_id: number; p_limit?: number }
        Returns: boolean
      }
      verify_api_key: { Args: { p_key: string }; Returns: Json }
      void_bar_sale: {
        Args: { p_reason?: string; p_sale_id: string }
        Returns: undefined
      }
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
  public: {
    Enums: {},
  },
} as const
