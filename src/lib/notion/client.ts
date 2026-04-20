import { Client } from '@notionhq/client'

export function createNotionClient() {
  const auth = process.env.NOTION_API_KEY
  if (!auth) throw new Error('NOTION_API_KEY is not set')
  return new Client({ auth })
}

export function isNotionConfigured() {
  return !!process.env.NOTION_API_KEY
}
