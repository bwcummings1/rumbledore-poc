import { render, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';

// Custom render function that includes providers
function AllTheProviders({ children }: { children: ReactNode }) {
  // For testing, we'll just pass through children
  // ThemeProvider is a client component and doesn't work well in Jest
  return <>{children}</>;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

// Test data factories
export const createMockUser = (overrides = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  displayName: 'Test User',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockLeague = (overrides = {}) => ({
  id: 'league-123',
  espnLeagueId: BigInt(123456),
  name: 'Test League',
  season: 2024,
  sandboxNamespace: 'league_123456_2024',
  settings: {
    scoringType: 'ppr',
    teamCount: 12,
    playoffTeams: 6,
  },
  isActive: true,
  lastSyncAt: null,
  createdBy: 'user-123',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockLeagueMember = (overrides = {}) => ({
  id: 'member-123',
  leagueId: 'league-123',
  userId: 'user-123',
  espnTeamId: 1,
  teamName: 'Test Team',
  role: 'MEMBER',
  joinedAt: new Date(),
  ...overrides,
});

// API response mocks
export function mockApiResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export const mockApiError = (message: string, status = 400, code?: string) => {
  return new Response(
    JSON.stringify({ error: message, code }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};

// Async utilities
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Test ID helpers
export const getByTestId = (container: HTMLElement, testId: string) => {
  return container.querySelector(`[data-testid="${testId}"]`);
};

export * from '@testing-library/react';