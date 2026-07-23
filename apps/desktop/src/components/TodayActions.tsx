import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Card } from './Card';
import { EmptyState } from './EmptyState';

type TodayActionsProps = {
  needsReviewCount: number;
  matchingGapCount: number;
  discussCount: number;
};

type TodayAction = {
  key: string;
  count: number;
  icon: ReactNode;
  title: string;
  detail: string;
  linkLabel: string;
  to: string;
};

// Clean line icons only — no emoji. Stroke-based, matching the app's quiet style.
const reviewIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M4 6h11" strokeLinecap="round" />
    <path d="M4 12h11" strokeLinecap="round" />
    <path d="M4 18h7" strokeLinecap="round" />
    <path d="m16 16 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const detailsIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
  </svg>
);

const summaryIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M8 4h8a1 1 0 0 1 1 1v15l-5-2.5L7 20V5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
    <path d="M9.5 9h5M9.5 12.5h5" strokeLinecap="round" />
  </svg>
);

const allClearIcon = (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12 2.4 2.4L15.8 9.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function TodayActions({ needsReviewCount, matchingGapCount, discussCount }: TodayActionsProps) {
  const actions: TodayAction[] = [];

  if (needsReviewCount > 0) {
    actions.push({
      key: 'review',
      count: needsReviewCount,
      icon: reviewIcon,
      title: `Review ${needsReviewCount} new ${pluralize(needsReviewCount, 'finding', 'findings')}`,
      detail: 'These are new to you. A quick look lets you set aside what does not fit and save the rest for the doctor.',
      linkLabel: 'Start reviewing',
      to: '/findings'
    });
  }

  if (discussCount > 0) {
    actions.push({
      key: 'discuss',
      count: discussCount,
      icon: summaryIcon,
      title: 'Prepare your doctor summary',
      detail: `You have saved ${discussCount} ${pluralize(
        discussCount,
        'finding',
        'findings'
      )} to discuss. Turn them into a clear summary to bring to the next visit.`,
      linkLabel: 'Prepare summary',
      to: '/clinician'
    });
  }

  if (matchingGapCount > 0) {
    actions.push({
      key: 'gaps',
      count: matchingGapCount,
      icon: detailsIcon,
      title: 'Add details to improve matching',
      detail: `Firstlight flagged ${matchingGapCount} ${pluralize(
        matchingGapCount,
        'detail',
        'details'
      )} that, if you can add ${pluralize(matchingGapCount, 'it', 'them')}, would help it judge these items more confidently.`,
      linkLabel: 'Add details',
      to: '/profile'
    });
  }

  return (
    <Card
      title="Today's next steps"
      description="A short, prioritized list of what is worth doing next. Anything you finish drops off this list."
      className="today-actions-card"
    >
      {actions.length === 0 ? (
        <div className="today-actions-clear">
          <span className="today-actions-clear-icon">{allClearIcon}</span>
          <EmptyState
            title="You're all caught up"
            message="Nothing needs your attention right now. Firstlight will let you know when something new lands."
          />
        </div>
      ) : (
        <ul className="today-actions-list">
          {actions.map((action) => (
            <li className="today-action" key={action.key}>
              <span className="today-action-icon" aria-hidden="true">
                {action.icon}
              </span>
              <div className="today-action-copy">
                <strong className="today-action-title">{action.title}</strong>
                <p className="today-action-detail">{action.detail}</p>
              </div>
              <Link className="secondary-button today-action-link" to={action.to}>
                {action.linkLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
