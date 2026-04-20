import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CapturesClient } from '@/app/dashboard/captures/CapturesClient'

vi.mock('@/app/dashboard/captures/actions', () => ({
  markCaptureReviewed: vi.fn().mockResolvedValue(undefined),
  deleteCapture: vi.fn().mockResolvedValue(undefined),
}))

const makeCapture = (overrides: Partial<{
  id: string; content: string; type: string; reviewed: boolean; entity_context: string | null; created_at: string
}> = {}) => ({
  id: 'cap-1',
  content: 'Test capture',
  type: 'idea',
  reviewed: false,
  entity_context: null,
  created_at: new Date(Date.now() - 60_000).toISOString(),
  ...overrides,
})

describe('CapturesClient', () => {
  it('renders unreviewed captures', () => {
    render(<CapturesClient initialCaptures={[makeCapture()]} />)
    expect(screen.getByText('Test capture')).toBeInTheDocument()
  })

  it('shows inbox zero when no unreviewed captures', () => {
    render(<CapturesClient initialCaptures={[makeCapture({ reviewed: true })]} />)
    expect(screen.getByText(/inbox zero/i)).toBeInTheDocument()
  })

  it('hides reviewed captures in Unreviewed filter', () => {
    render(<CapturesClient initialCaptures={[
      makeCapture({ id: 'cap-1', content: 'Open capture', reviewed: false }),
      makeCapture({ id: 'cap-2', content: 'Done capture', reviewed: true }),
    ]} />)
    expect(screen.getByText('Open capture')).toBeInTheDocument()
    expect(screen.queryByText('Done capture')).not.toBeInTheDocument()
  })

  it('shows all captures when All filter is selected', () => {
    render(<CapturesClient initialCaptures={[
      makeCapture({ id: 'cap-1', content: 'Open capture', reviewed: false }),
      makeCapture({ id: 'cap-2', content: 'Done capture', reviewed: true }),
    ]} />)
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('Open capture')).toBeInTheDocument()
    expect(screen.getByText('Done capture')).toBeInTheDocument()
  })

  it('removes a capture optimistically on delete', () => {
    render(<CapturesClient initialCaptures={[makeCapture({ content: 'To delete' })]} />)
    fireEvent.click(screen.getByTitle('Delete'))
    expect(screen.queryByText('To delete')).not.toBeInTheDocument()
  })

  it('marks a capture as reviewed optimistically', () => {
    render(<CapturesClient initialCaptures={[makeCapture({ content: 'Review me' })]} />)
    fireEvent.click(screen.getByText('✓ Done'))
    // After marking reviewed, the "✓ Done" button disappears (reviewed items have no button)
    expect(screen.queryByText('✓ Done')).not.toBeInTheDocument()
  })
})
