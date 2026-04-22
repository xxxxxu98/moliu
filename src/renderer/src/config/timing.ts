export const timing = {
  // Animation delays
  animation: {
    short: 300,
    medium: 500,
    long: 800,
  },
  // Mock API delays (for development/demo)
  mockApi: {
    quick: 500,
    standard: 1000,
    slow: 1500,
    verySlow: 2000,
  },
  // Auto-save intervals (in seconds)
  autoSave: {
    min: 30,
    default: 60,
    max: 300,
  },
  // Debounce delays
  debounce: {
    search: 300,
    input: 500,
  },
} as const;
