import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ReportGenerator } from './ReportGenerator'

test('ReportGenerator renders correctly and handles input', () => {
  const mockQuestions = [
    { id: 'q1', label: 'Test Question', type: 'text' as const, value: '', required: true }
  ]
  const handleChange = vi.fn()
  const handleSubmit = vi.fn()

  render(
    <ReportGenerator 
      questions={mockQuestions}
      onChange={handleChange}
      onSubmit={handleSubmit}
      isGenerating={false}
      validation={true}
    />
  )

  expect(screen.getByText('REPORT GENERATOR')).toBeInTheDocument()
  
  // Expand section to see the input
  const button = screen.getByRole('button', { name: /Test Question/i })
  fireEvent.click(button)

  const input = screen.getByLabelText('Test Question')
  fireEvent.change(input, { target: { value: 'test value' } })
  
  expect(handleChange).toHaveBeenCalledWith('q1', 'test value')
})
