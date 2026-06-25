/** Areas pure helpers (Sprint 13 A1). */
import { describe, it, expect } from 'vitest'
import { slugifyArea, groupAreasByEntity, compareAreas, nextAreaSortOrder, type Area } from '@/lib/areas/areas'

const area = (over: Partial<Area>): Area =>
  ({ id: 'x', entity: 'tm', name: 'A', slug: 'a', sort_order: 0, ...over })

describe('slugifyArea', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyArea('Work Orders')).toBe('work-orders')
    expect(slugifyArea('Field Ops')).toBe('field-ops')
  })
  it('collapses runs of non-alphanumerics and trims edges', () => {
    expect(slugifyArea('  Pricing & Contracts!! ')).toBe('pricing-contracts')
    expect(slugifyArea('R&D / 2026')).toBe('r-d-2026')
  })
  it('returns empty string when nothing is slug-able', () => {
    expect(slugifyArea('   ')).toBe('')
    expect(slugifyArea('—')).toBe('')
  })
})

describe('groupAreasByEntity', () => {
  it('groups by entity and sorts each group by sort_order then name', () => {
    const areas = [
      area({ id: '1', entity: 'tm', name: 'Product', sort_order: 1 }),
      area({ id: '2', entity: 'tm', name: 'Migration', sort_order: 0 }),
      area({ id: '3', entity: 'sfo', name: 'Invoicing', sort_order: 0 }),
    ]
    const g = groupAreasByEntity(areas)
    expect(g.tm.map(a => a.name)).toEqual(['Migration', 'Product'])
    expect(g.sfo.map(a => a.name)).toEqual(['Invoicing'])
  })
  it('breaks sort_order ties by name', () => {
    const g = groupAreasByEntity([
      area({ id: '1', name: 'Zeta', sort_order: 0 }),
      area({ id: '2', name: 'Alpha', sort_order: 0 }),
    ])
    expect(g.tm.map(a => a.name)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('compareAreas', () => {
  it('orders by sort_order first', () => {
    expect(compareAreas(area({ sort_order: 0 }), area({ sort_order: 2 }))).toBeLessThan(0)
  })
})

describe('nextAreaSortOrder', () => {
  it('is one past the max, or 0 for an empty entity', () => {
    expect(nextAreaSortOrder([])).toBe(0)
    expect(nextAreaSortOrder([area({ sort_order: 0 }), area({ sort_order: 4 })])).toBe(5)
  })
})
