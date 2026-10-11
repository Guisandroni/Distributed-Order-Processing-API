export function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) as T : fallback
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}
