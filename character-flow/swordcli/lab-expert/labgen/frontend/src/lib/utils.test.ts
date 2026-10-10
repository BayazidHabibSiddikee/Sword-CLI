import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('utils', () => {
  it('cn() merges tailwind classes correctly', () => {
    expect(cn('px-2', 'py-2')).toBe('px-2 py-2')
    expect(cn('p-2 p-4')).toBe('p-4')
    expect(cn('text-red-500', { 'bg-blue-500': true })).toBe('text-red-500 bg-blue-500')
  })
})
