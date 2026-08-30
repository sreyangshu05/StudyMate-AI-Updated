import { vi, describe, it, test, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';

export function mock(impl) {
  return vi.fn(impl);
}

mock.module = (id, factory) => vi.doMock(id, factory);
mock.clearAllMocks = () => vi.clearAllMocks();

export { describe, it, test, expect, beforeAll, beforeEach, afterAll, afterEach, vi };
