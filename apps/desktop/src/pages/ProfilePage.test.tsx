import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';
import { api } from '../lib/api';
import type { PatientProfile } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getActiveProfile: vi.fn(),
    updateProfile: vi.fn(),
    createProfile: vi.fn()
  }
}));

const mockedApi = vi.mocked(api);

const profile: PatientProfile = {
  id: 1,
  profile_name: 'Mom',
  cancer_type: 'breast cancer',
  would_consider: [],
  would_not_consider: [],
  is_active: true,
  biomarkers: [],
  therapy_history: []
};

function renderInRouter() {
  const router = createMemoryRouter(
    [
      { path: '/profile', element: <ProfilePage /> },
      { path: '/other', element: <div>Other page</div> }
    ],
    { initialEntries: ['/profile'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('ProfilePage unsaved-changes guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getActiveProfile.mockResolvedValue(profile);
  });

  it('blocks router navigation (including Back/Forward) when edits are pending and the user cancels', async () => {
    const router = renderInRouter();
    await screen.findByDisplayValue('breast cancer');

    // Make the form dirty.
    await userEvent.type(screen.getByLabelText('Cancer type'), ' (HER2+)');

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => {
      await router.navigate('/other');
    });

    expect(confirmSpy).toHaveBeenCalled();
    // Navigation was blocked — still on the profile route.
    expect(screen.queryByText('Other page')).not.toBeInTheDocument();
  });

  it('allows navigation when there are no pending edits', async () => {
    const router = renderInRouter();
    await screen.findByDisplayValue('breast cancer');

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      await router.navigate('/other');
    });

    // Clean form: no prompt, navigation proceeds.
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Other page')).toBeInTheDocument());
  });
});
