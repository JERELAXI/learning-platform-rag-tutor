import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { clearTokens } from '../api/tokens'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  // The token store is module-level state shared across tests; without this a
  // test that signs in leaks its session into the next one.
  localStorage.clear()
  clearTokens()
})
