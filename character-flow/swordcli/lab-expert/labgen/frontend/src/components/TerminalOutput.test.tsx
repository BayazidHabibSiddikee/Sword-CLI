import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { TerminalOutput } from './TerminalOutput'
import React from 'react'

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

test('TerminalOutput renders logs and handles minimize', () => {
  const handleClose = vi.fn()
  const logs = ['Log message 1', 'Log message 2']

  render(
    <TerminalOutput logs={logs} isActive={true} onClose={handleClose} />
  )

  expect(screen.getByText('Log message 1')).toBeInTheDocument()
  expect(screen.getByText('Log message 2')).toBeInTheDocument()

  const minimizeBtn = screen.getByLabelText('Minimize terminal to tray')
  fireEvent.click(minimizeBtn)

  // Should show the restore button when minimized
  expect(screen.getByLabelText('Restore terminal')).toBeInTheDocument()
})
