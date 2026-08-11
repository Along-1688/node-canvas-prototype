import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

const localStorageValues = new Map<string, string>()
const testLocalStorage: Storage = {
  get length() { return localStorageValues.size },
  clear: () => localStorageValues.clear(),
  getItem: (key) => localStorageValues.get(key) ?? null,
  key: (index) => Array.from(localStorageValues.keys())[index] ?? null,
  removeItem: (key) => { localStorageValues.delete(key) },
  setItem: (key, value) => { localStorageValues.set(key, String(value)) },
}
Object.defineProperty(window, 'localStorage', { configurable: true, value: testLocalStorage })

afterEach(cleanup)
