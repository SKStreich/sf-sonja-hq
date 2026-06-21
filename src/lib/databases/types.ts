// HQ Databases primitive — shared types (Phase B1).
// See docs/specs/hq_databases_v1.html.

export type DbPropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'checkbox'
  | 'date'
  | 'url'
  | 'relation'

export interface DbSelectOption {
  name: string
  color?: string // Notion-style color name (e.g. 'blue', 'green') — see format.ts
}

export interface DbPropertyConfig {
  options?: DbSelectOption[] // select / multi_select / status
  relationDatabaseId?: string // relation target db
  [key: string]: unknown
}

export interface DbProperty {
  id: string
  database_id: string
  name: string
  type: DbPropertyType
  position: number
  config: DbPropertyConfig
  is_title: boolean
}

export interface DbRecord {
  id: string
  database_id: string
  position: number
  values: Record<string, unknown> // property_id -> value
  created_at: string
  updated_at: string
}

export interface HqDatabase {
  id: string
  org_id: string
  title: string
  icon: string | null
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  entities: string[]
  record_count?: number
}

export interface DatabaseDetail {
  database: HqDatabase
  properties: DbProperty[]
  records: DbRecord[]
}
