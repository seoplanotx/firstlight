import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// With globals disabled, React Testing Library's automatic cleanup is not
// registered, so unmount rendered trees between tests ourselves.
afterEach(() => {
  cleanup();
});
