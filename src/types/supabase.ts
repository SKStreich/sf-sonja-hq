export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type EntityType = 'tm' | 'sf' | 'personal'
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'complete'
export type ProjectPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'parked'
export type IdeaStatus = 'raw' | 'developing' | 'parked' | 'shipped'
export type IdeaSource = 'typed' | 'voice' | 'chat'
export type DocumentSource = 'notion' | 'upload' | 'generated'
export type IntegrationType = 'notion' | 'claude' | 'ms365' | 'slack' | 'github' | 'stripe' | 'tm_api'
export type IntegrationStatus = 'active' | 'error' | 'disconnected'
export type ConfidentialityTier = 'private' | 'team' | 'shared' | 'public'
export type UserRole = 'owner' | 'admin' | 'member' | 'read_only'
export type ProjectMemberPermission = 'view' | 'comment' | 'edit' | 'manage'
export type ProjectMemberStatus = 'pending' | 'accepted' | 'declined'
export type NotificationType = 'assignment' | 'update' | 'due_date' | 'mention' | 'invite' | 'comment'
export type ResourceService = 'supabase' | 'claude_api' | 'vercel' | 'resend' | 'whisper'
export type ResourceMetricType = 'api_calls' | 'tokens_used' | 'emails_sent' | 'audio_minutes' | 'storage_gb' | 'bandwidth_gb' | 'function_invocations'

export interface Database {
  public: {
    Tables: {
      orgs: {
        Row: { id: string; name: string; slug: string; logo_url: string | null; primary_color: string; active: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; slug: string; logo_url?: string | null; primary_color?: string; active?: boolean }
        Update: { name?: string; slug?: string; logo_url?: string | null; primary_color?: string; active?: boolean }
      }
      user_profiles: {
        Row: { id: string; org_id: string; email: string; full_name: string | null; avatar_url: string | null; role: UserRole; active: boolean; created_at: string; updated_at: string }
        Insert: { id: string; org_id: string; email: string; full_name?: string | null; avatar_url?: string | null; role?: UserRole; active?: boolean }
        Update: { org_id?: string; email?: string; full_name?: string | null; avatar_url?: string | null; role?: UserRole; active?: boolean }
      }
      entities: {
        Row: { id: string; org_id: string; created_by: string; name: string; type: EntityType; color: string; icon: string | null; active: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; org_id: string; created_by: string; name: string; type: EntityType; color?: string; icon?: string | null; active?: boolean }
        Update: { name?: string; color?: string; icon?: string | null; active?: boolean }
      }
      projects: {
        Row: { id: string; org_id: string; created_by: string; entity_id: string; name: string; description: string | null; status: ProjectStatus; priority: ProjectPriority; phase: string | null; next_action: string | null; due_date: string | null; tags: string[]; notion_url: string | null; github_url: string | null; live_url: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; org_id: string; created_by: string; entity_id: string; name: string; description?: string | null; status?: ProjectStatus; priority?: ProjectPriority; phase?: string | null; next_action?: string | null; due_date?: string | null; tags?: string[]; notion_url?: string | null; github_url?: string | null; live_url?: string | null }
        Update: { name?: string; description?: string | null; status?: ProjectStatus; priority?: ProjectPriority; phase?: string | null; next_action?: string | null; due_date?: string | null; tags?: string[]; notion_url?: string | null; github_url?: string | null; live_url?: string | null }
      }
      tasks: {
        Row: { id: string; org_id: string; user_id: string; created_by: string; entity_id: string; project_id: string | null; title: string; description: string | null; status: TaskStatus; priority: ProjectPriority; due_date: string | null; tags: string[]; confidentiality_tier: ConfidentialityTier; created_at: string; updated_at: string }
        Insert: { id?: string; org_id: string; user_id: string; created_by: string; entity_id: string; project_id?: string | null; title: string; description?: string | null; status?: TaskStatus; priority?: ProjectPriority; due_date?: string | null; tags?: string[]; confidentiality_tier?: ConfidentialityTier }
        Update: { title?: string; description?: string | null; status?: TaskStatus; priority?: ProjectPriority; due_date?: string | null; tags?: string[]; confidentiality_tier?: ConfidentialityTier }
      }
      ideas: {
        Row: { id: string; org_id: string; user_id: string; created_by: string; entity_id: string; project_id: string | null; text: string; status: IdeaStatus; source: IdeaSource; tags: string[]; confidentiality_tier: ConfidentialityTier; created_at: string; updated_at: string }
        Insert: { id?: string; org_id: string; user_id: string; created_by: string; entity_id: string; project_id?: string | null; text: string; status?: IdeaStatus; source?: IdeaSource; tags?: string[]; confidentiality_tier?: ConfidentialityTier }
        Update: { text?: string; status?: IdeaStatus; source?: IdeaSource; tags?: string[]; project_id?: string | null; confidentiality_tier?: ConfidentialityTier }
      }
      chat_history: {
        Row: { id: string; org_id: string; user_id: string; created_by: string; entity_id: string | null; claude_chat_id: string | null; title: string; summary: string | null; key_decisions: string[]; url: string | null; chat_date: string | null; tags: string[]; indexed_at: string; created_at: string; updated_at: string }
        Insert: { id?: string; org_id: string; user_id: string; created_by: string; entity_id?: string | null; claude_chat_id?: string | null; title: string; summary?: string | null; key_decisions?: string[]; url?: string | null; chat_date?: string | null; tags?: string[] }
        Update: { entity_id?: string | null; title?: string; summary?: string | null; key_decisions?: string[]; url?: string | null; chat_date?: string | null; tags?: string[] }
      }
      documents: {
        Row: { id: string; org_id: string; created_by: string; entity_id: string | null; title: string; source: DocumentSource; notion_page_id: string | null; notion_url: string | null; content_preview: string | null; tags: string[]; last_synced_at: string | null; confidentiality_tier: ConfidentialityTier; created_at: string; updated_at: string }
        Insert: { id?: string; org_id: string; created_by: string; entity_id?: string | null; title: string; source?: DocumentSource; notion_page_id?: string | null; notion_url?: string | null; content_preview?: string | null; tags?: string[]; confidentiality_tier?: ConfidentialityTier }
        Update: { entity_id?: string | null; title?: string; notion_page_id?: string | null; notion_url?: string | null; content_preview?: string | null; tags?: string[]; last_synced_at?: string | null; confidentiality_tier?: ConfidentialityTier }
      }
      integrations: {
        Row: { id: string; org_id: string; created_by: string; type: IntegrationType; config: Json; status: IntegrationStatus; last_sync_at: string | null; scopes: string[]; created_at: string; updated_at: string }
        Insert: { id?: string; org_id: string; created_by: string; type: IntegrationType; config?: Json; status?: IntegrationStatus; last_sync_at?: string | null; scopes?: string[] }
        Update: { config?: Json; status?: IntegrationStatus; last_sync_at?: string | null; scopes?: string[] }
      }
      activity_log: {
        Row: { id: string; org_id: string; user_id: string; created_by: string; entity_type: string; entity_id: string; action: string; metadata: Json; created_at: string; updated_at: string }
        Insert: { id?: string; org_id: string; user_id: string; created_by: string; entity_type: string; entity_id: string; action: string; metadata?: Json }
        Update: never
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      entity_type: EntityType; project_status: ProjectStatus; project_priority: ProjectPriority
      task_status: TaskStatus; idea_status: IdeaStatus; idea_source: IdeaSource
      document_source: DocumentSource; integration_type: IntegrationType
      integration_status: IntegrationStatus; confidentiality_tier: ConfidentialityTier; user_role: UserRole
    }
  }
}
