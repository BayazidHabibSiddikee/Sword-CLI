import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ReportExplorer } from './ReportExplorer'

test('ReportExplorer renders correctly and filters reports', () => {
  const mockReports = [
    { id: '1', name: 'Report 1', experiment: 'Exp A', status: 'complete' as const, progress: 100, createdAt: new Date().toISOString() },
    { id: '2', name: 'Report 2', experiment: 'Exp B', status: 'error' as const, progress: 50, createdAt: new Date().toISOString() }
  ]
  const handleSelect = vi.fn()
  const handleDelete = vi.fn()
  const handleOpen = vi.fn()

  render(
    <ReportExplorer
      reports={mockReports}
      selectedReport={null}
      onSelect={handleSelect}
      onDelete={handleDelete}
      onOpen={handleOpen}
    />
  )

  const searchInput = screen.getByPlaceholderText('Search reports...')
  expect(searchInput).toBeInTheDocument()

  fireEvent.change(searchInput, { target: { value: 'Report 1' } })

  // Expand the folder (which is today's date)
  const dateStr = new Date().toISOString().split('T')[0]
  const folderBtn = screen.getByText(dateStr, { exact: false })
  fireEvent.click(folderBtn)

  expect(screen.getByText('Report 1')).toBeInTheDocument()
  expect(screen.queryByText('Report 2')).not.toBeInTheDocument()
})
