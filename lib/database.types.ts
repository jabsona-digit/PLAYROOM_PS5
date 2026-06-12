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
          customer_name: string | null
          id: string
          org_id: string
          payment_method: string
          session_id: string | null
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
          customer_name?: string | null
          id?: string
          org_id: string
          payment_method?: string
          session_id?: string | null
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
          customer_name?: string | null
          id?: string
          org_id?: string
          payment_method?: string
          session_id?: string | null
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
      consoles: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: number
          name: string
          org_id: string
          slot_number: number
          status: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          name: string
          org_id: string
          slot_number: number
          status?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          name?: string
          org_id?: string
          slot_number?: number
          status?: string
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
      customers: {
        Row: {
          created_at: string
          deleted_at: string | null
          discount_pct: number
          id: string
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
          name?: string
          org_id?: string
          phone?: string | null
          points?: number
          total_spent?: number
          visit_count?: number
        }
        Relationships: [
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
          commission_amount: number
          console_id: number | null
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
          reservation_id: string | null
          start_time: string
          status: string
          total_amount: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          commission_amount?: number
          console_id?: number | null
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
          reservation_id?: string | null
          start_time: string
          status?: string
          total_amount?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          commission_amount?: number
          console_id?: number | null
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
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
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
      organizations: {
        Row: {
          created_at: string
          id: string
          identification_code: string | null
          name: string
          plan: string
          slug: string | null
          subscription_status: string
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identification_code?: string | null
          name: string
          plan?: string
          slug?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identification_code?: string | null
          name?: string
          plan?: string
          slug?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
        }
        Relationships: []
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
      pricing_plans: {
        Row: {
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
      session_extensions: {
        Row: {
          created_at: string
          extra_minutes: number
          extra_price: number
          id: string
          org_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          extra_minutes: number
          extra_price: number
          id?: string
          org_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          extra_minutes?: number
          extra_price?: number
          id?: string
          org_id?: string
          session_id?: string
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
      tournament_matches: {
        Row: {
          console_id: number | null
          created_at: string
          id: string
          next_match_id: string | null
          next_slot: number | null
          org_id: string
          p1_id: string | null
          p2_id: string | null
          position: number
          round: number
          score1: number | null
          score2: number | null
          status: string
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          console_id?: number | null
          created_at?: string
          id?: string
          next_match_id?: string | null
          next_slot?: number | null
          org_id: string
          p1_id?: string | null
          p2_id?: string | null
          position: number
          round: number
          score1?: number | null
          score2?: number | null
          status?: string
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          console_id?: number | null
          created_at?: string
          id?: string
          next_match_id?: string | null
          next_slot?: number | null
          org_id?: string
          p1_id?: string | null
          p2_id?: string | null
          position?: number
          round?: number
          score1?: number | null
          score2?: number | null
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
          id: string
          name: string
          org_id: string
          phone: string | null
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          phone?: string | null
          tournament_id: string
        }
        Update: {
          created_at?: string
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
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          bracket_size: number | null
          created_at: string
          entry_fee: number
          format: string
          game: string | null
          id: string
          max_participants: number | null
          name: string
          org_id: string
          prize_pool: number
          starts_at: string | null
          status: string
          venue_id: string
          winner_participant_id: string | null
        }
        Insert: {
          bracket_size?: number | null
          created_at?: string
          entry_fee?: number
          format?: string
          game?: string | null
          id?: string
          max_participants?: number | null
          name: string
          org_id: string
          prize_pool?: number
          starts_at?: string | null
          status?: string
          venue_id: string
          winner_participant_id?: string | null
        }
        Update: {
          bracket_size?: number | null
          created_at?: string
          entry_fee?: number
          format?: string
          game?: string | null
          id?: string
          max_participants?: number | null
          name?: string
          org_id?: string
          prize_pool?: number
          starts_at?: string | null
          status?: string
          venue_id?: string
          winner_participant_id?: string | null
        }
        Relationships: [
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
          id: string | null
          member_count: number | null
          name: string | null
          plan: string | null
          subscription_status: string | null
          total_revenue: number | null
          trial_ends_at: string | null
          venue_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          member_count?: never
          name?: string | null
          plan?: string | null
          subscription_status?: string | null
          total_revenue?: never
          trial_ends_at?: string | null
          venue_count?: never
        }
        Update: {
          created_at?: string | null
          id?: string | null
          member_count?: never
          name?: string | null
          plan?: string | null
          subscription_status?: string | null
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
      public_venue_plans: {
        Row: {
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
      cancel_reservation: {
        Args: { p_reason?: string; p_reservation_id: string }
        Returns: undefined
      }
      clock_toggle: {
        Args: { p_pin: string; p_venue_id: string }
        Returns: Json
      }
      confirm_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
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
      create_marketplace_booking: {
        Args: {
          p_console_id?: number
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
      delete_console: { Args: { p_console_id: number }; Returns: undefined }
      delete_customer: { Args: { p_customer_id: string }; Returns: undefined }
      delete_expense: { Args: { p_expense_id: string }; Returns: undefined }
      end_session:
        | { Args: { p_session_id: string }; Returns: undefined }
        | { Args: { p_session_id: string; p_tip?: number }; Returns: undefined }
      extend_session: {
        Args: { p_extra_min: number; p_session_id: string }
        Returns: undefined
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
      next_fiscal_receipt_no: { Args: never; Returns: string }
      next_invoice_number: { Args: { p_org_id: string }; Returns: string }
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
      reply_to_review: {
        Args: { p_id: string; p_reply: string }
        Returns: undefined
      }
      report_match: {
        Args: { p_match: string; p_score1: number; p_score2: number }
        Returns: undefined
      }
      seed_tournament: { Args: { p_tournament: string }; Returns: undefined }
      set_employee_pin: {
        Args: { p_employee_id: number; p_pin: string }
        Returns: undefined
      }
      slugify: { Args: { p: string }; Returns: string }
      start_open_session: {
        Args: {
          p_bank?: string
          p_console_id: number
          p_created_by?: number
          p_customer_name?: string
          p_payment_method?: string
          p_plan_id: number
        }
        Returns: {
          bank: string | null
          console_id: number
          created_at: string
          created_by: number | null
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
      submit_review: {
        Args: { p_booking_id: string; p_comment?: string; p_rating: number }
        Returns: string
      }
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
