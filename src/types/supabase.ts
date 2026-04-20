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
      activity_log: {
        Row: {
          action: string
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      captures: {
        Row: {
          content: string
          created_at: string
          entity_context: string | null
          id: string
          promoted_at: string | null
          promoted_to_id: string | null
          promoted_to_type: string | null
          resolved: boolean
          reviewed: boolean
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          entity_context?: string | null
          id?: string
          promoted_at?: string | null
          promoted_to_id?: string | null
          promoted_to_type?: string | null
          resolved?: boolean
          reviewed?: boolean
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          entity_context?: string | null
          id?: string
          promoted_at?: string | null
          promoted_to_id?: string | null
          promoted_to_type?: string | null
          resolved?: boolean
          reviewed?: boolean
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          chat_date: string | null
          claude_chat_id: string | null
          created_at: string
          created_by: string
          entity_id: string | null
          id: string
          indexed_at: string
          key_decisions: string[] | null
          org_id: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          chat_date?: string | null
          claude_chat_id?: string | null
          created_at?: string
          created_by: string
          entity_id?: string | null
          id?: string
          indexed_at?: string
          key_decisions?: string[] | null
          org_id: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          chat_date?: string | null
          claude_chat_id?: string | null
          created_at?: string
          created_by?: string
          entity_id?: string | null
          id?: string
          indexed_at?: string
          key_decisions?: string[] | null
          org_id?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          confidentiality_tier: Database["public"]["Enums"]["confidentiality_tier"]
          content_preview: string | null
          created_at: string
          created_by: string
          entity_id: string | null
          id: string
          last_synced_at: string | null
          notion_page_id: string | null
          notion_url: string | null
          org_id: string
          source: Database["public"]["Enums"]["document_source"]
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          confidentiality_tier?: Database["public"]["Enums"]["confidentiality_tier"]
          content_preview?: string | null
          created_at?: string
          created_by: string
          entity_id?: string | null
          id?: string
          last_synced_at?: string | null
          notion_page_id?: string | null
          notion_url?: string | null
          org_id: string
          source?: Database["public"]["Enums"]["document_source"]
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          confidentiality_tier?: Database["public"]["Enums"]["confidentiality_tier"]
          content_preview?: string | null
          created_at?: string
          created_by?: string
          entity_id?: string | null
          id?: string
          last_synced_at?: string | null
          notion_page_id?: string | null
          notion_url?: string | null
          org_id?: string
          source?: Database["public"]["Enums"]["document_source"]
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      entities: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          created_by: string
          icon: string | null
          id: string
          name: string
          org_id: string
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          created_by: string
          icon?: string | null
          id?: string
          name: string
          org_id: string
          type: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          created_by?: string
          icon?: string | null
          id?: string
          name?: string
          org_id?: string
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
        }
        Relationships: []
      }
      focus_notes: {
        Row: {
          archived: boolean
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ideas: {
        Row: {
          confidentiality_tier: Database["public"]["Enums"]["confidentiality_tier"]
          created_at: string
          created_by: string
          entity_id: string
          id: string
          org_id: string
          project_id: string | null
          source: Database["public"]["Enums"]["idea_source"]
          status: Database["public"]["Enums"]["idea_status"]
          tags: string[] | null
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidentiality_tier?: Database["public"]["Enums"]["confidentiality_tier"]
          created_at?: string
          created_by: string
          entity_id: string
          id?: string
          org_id: string
          project_id?: string | null
          source?: Database["public"]["Enums"]["idea_source"]
          status?: Database["public"]["Enums"]["idea_status"]
          tags?: string[] | null
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidentiality_tier?: Database["public"]["Enums"]["confidentiality_tier"]
          created_at?: string
          created_by?: string
          entity_id?: string
          id?: string
          org_id?: string
          project_id?: string | null
          source?: Database["public"]["Enums"]["idea_source"]
          status?: Database["public"]["Enums"]["idea_status"]
          tags?: string[] | null
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json | null
          created_at: string
          created_by: string
          id: string
          last_sync_at: string | null
          org_id: string
          scopes: string[] | null
          status: Database["public"]["Enums"]["integration_status"]
          type: Database["public"]["Enums"]["integration_type"]
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          created_by: string
          id?: string
          last_sync_at?: string | null
          org_id: string
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["integration_status"]
          type: Database["public"]["Enums"]["integration_type"]
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          created_by?: string
          id?: string
          last_sync_at?: string | null
          org_id?: string
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["integration_status"]
          type?: Database["public"]["Enums"]["integration_type"]
          updated_at?: string
        }
        Relationships: []
      }
      milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          org_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          org_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          org_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          message: string | null
          org_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          message?: string | null
          org_id?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          message?: string | null
          org_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orgs: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_at: string
          invited_by: string
          org_id: string
          permission: string
          project_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_at?: string
          invited_by: string
          org_id: string
          permission?: string
          project_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string
          org_id?: string
          permission?: string
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived: boolean
          confidentiality_tier: Database["public"]["Enums"]["confidentiality_tier"]
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          entity_id: string
          github_url: string | null
          id: string
          live_url: string | null
          name: string
          next_action: string | null
          notion_url: string | null
          org_id: string
          phase: string | null
          priority: Database["public"]["Enums"]["project_priority"]
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          confidentiality_tier?: Database["public"]["Enums"]["confidentiality_tier"]
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          entity_id: string
          github_url?: string | null
          id?: string
          live_url?: string | null
          name: string
          next_action?: string | null
          notion_url?: string | null
          org_id: string
          phase?: string | null
          priority?: Database["public"]["Enums"]["project_priority"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          confidentiality_tier?: Database["public"]["Enums"]["confidentiality_tier"]
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          entity_id?: string
          github_url?: string | null
          id?: string
          live_url?: string | null
          name?: string
          next_action?: string | null
          notion_url?: string | null
          org_id?: string
          phase?: string | null
          priority?: Database["public"]["Enums"]["project_priority"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      resource_usage: {
        Row: {
          cost_usd: number | null
          created_at: string
          id: string
          metric_type: string
          org_id: string | null
          period_end: string
          period_start: string
          raw_data: Json | null
          service: string
          synced_at: string
          user_id: string | null
          value: number
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          metric_type: string
          org_id?: string | null
          period_end: string
          period_start: string
          raw_data?: Json | null
          service: string
          synced_at?: string
          user_id?: string | null
          value?: number
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          metric_type?: string
          org_id?: string | null
          period_end?: string
          period_start?: string
          raw_data?: Json | null
          service?: string
          synced_at?: string
          user_id?: string | null
          value?: number
        }
        Relationships: []
      }
      tasks: {
        Row: {
          archived: boolean
          assignee_id: string | null
          completed_at: string | null
          confidentiality_tier: Database["public"]["Enums"]["confidentiality_tier"]
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          entity_id: string
          id: string
          org_id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["project_priority"]
          project_id: string | null
          sort_order: number
          status: Database["public"]["Enums"]["task_status"]
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          assignee_id?: string | null
          completed_at?: string | null
          confidentiality_tier?: Database["public"]["Enums"]["confidentiality_tier"]
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          entity_id: string
          id?: string
          org_id: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["project_priority"]
          project_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          assignee_id?: string | null
          completed_at?: string | null
          confidentiality_tier?: Database["public"]["Enums"]["confidentiality_tier"]
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          entity_id?: string
          id?: string
          org_id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["project_priority"]
          project_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          org_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_org_id: { Args: never; Returns: string }
    }
    Enums: {
      confidentiality_tier: "private" | "team" | "shared" | "public"
      document_source: "notion" | "upload" | "generated"
      entity_type: "tm" | "sf" | "personal"
      idea_source: "typed" | "voice" | "chat"
      idea_status: "raw" | "developing" | "parked" | "shipped"
      integration_status: "active" | "error" | "disconnected"
      integration_type: "notion" | "claude" | "ms365" | "slack" | "github" | "stripe" | "tm_api"
      project_priority: "high" | "medium" | "low"
      project_status: "planning" | "active" | "on_hold" | "complete"
      task_status: "todo" | "in_progress" | "done" | "parked"
      user_role: "owner" | "admin" | "member" | "read_only"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience type aliases used throughout the app
export type EntityType = Database["public"]["Enums"]["entity_type"]
export type ProjectStatus = Database["public"]["Enums"]["project_status"]
export type ProjectPriority = Database["public"]["Enums"]["project_priority"]
export type TaskStatus = Database["public"]["Enums"]["task_status"]
export type ConfidentialityTier = Database["public"]["Enums"]["confidentiality_tier"]
export type UserRole = Database["public"]["Enums"]["user_role"]
export type IdeaStatus = Database["public"]["Enums"]["idea_status"]
export type IdeaSource = Database["public"]["Enums"]["idea_source"]
export type DocumentSource = Database["public"]["Enums"]["document_source"]
export type IntegrationType = Database["public"]["Enums"]["integration_type"]
export type IntegrationStatus = Database["public"]["Enums"]["integration_status"]
export type ProjectMemberPermission = "view" | "comment" | "edit" | "manage"
export type ProjectMemberStatus = "pending" | "accepted" | "declined"
export type NotificationType = "assignment" | "update" | "due_date" | "mention" | "invite" | "comment"
export type ResourceService = "supabase" | "claude_api" | "vercel" | "resend" | "whisper"
export type ResourceMetricType = "api_calls" | "tokens_used" | "emails_sent" | "audio_minutes" | "storage_gb" | "bandwidth_gb" | "function_invocations"
