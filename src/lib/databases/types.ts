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
  relationDatabaseId?: string // relation target HQ database (set when resolvable)
  notionRelationDatabaseId?: string // relation target *Notion* db id (from import)
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
  /** Source Notion page id, when this record was imported (U3d). The join key a
   *  relation cell's raw page-id array resolves against. */
  notion_page_id?: string | null
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
  /** Source Notion database id, when imported (U3d). Lets a relation property's
   *  `notionRelationDatabaseId` resolve to the HQ database it became. */
  notion_database_id?: string | null
}

/** A resolved relation target: the HQ record an id points at, plus its title. */
export interface RelationTarget {
  recordId: string
  title: string
}

export interface DatabaseDetail {
  database: HqDatabase
  properties: DbProperty[]
  records: DbRecord[]
  /** Per relation-property-id, a lookup from a stored relation id (either an HQ
   *  record id or a Notion page id) to its resolved target. Built by the reader
   *  for relation columns whose target database is also in the org; absent when
   *  there is nothing to resolve. */
  relationIndex?: Record<string, Record<string, RelationTarget>>
}
