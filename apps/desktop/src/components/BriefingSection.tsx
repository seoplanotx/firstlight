import { Card } from './Card';
import { FindingSummaryCard } from './FindingSummaryCard';
import type { BriefingFindingSection, FindingAction } from '../lib/types';

type BriefingSectionProps = {
  section: BriefingFindingSection;
  anchorId?: string;
  showWhy?: boolean;
  onAction?: (findingId: number, action: FindingAction) => void;
  pendingId?: number | null;
};

// Plainer, family-facing titles and intros for the backend section keys.
const SECTION_COPY: Record<string, { title: string; description: string }> = {
  new_findings: {
    title: 'New since your last check',
    description: 'Items that showed up for the first time in the latest check.'
  },
  changed_findings: {
    title: 'Updated since your last check',
    description: 'Things you have seen before that changed in a way worth another look.'
  },
  top_trial_matches: {
    title: 'Trials worth a closer look',
    description: 'Open, higher-signal trials pulled to the top so you can scan them quickly.'
  },
  top_literature_updates: {
    title: 'Research worth a closer look',
    description: 'Recent research and drug updates, sorted so the freshest is first.'
  }
};

export function BriefingSection({ section, anchorId, showWhy = true, onAction, pendingId }: BriefingSectionProps) {
  const copy = SECTION_COPY[section.key];
  const title = copy?.title ?? section.title;
  const description = copy?.description ?? section.description;

  return (
    <div id={anchorId}>
      <Card title={title} description={description} action={<span className="section-counter">{section.count} total</span>}>
        {section.items.length === 0 ? (
          <p className="section-empty-note">{section.empty_message}</p>
        ) : (
          <div className="finding-list">
            {section.items.map((finding) => (
              <FindingSummaryCard
                key={finding.id}
                finding={finding}
                showWhy={showWhy}
                onAction={onAction ? (action) => onAction(finding.id, action) : undefined}
                actionPending={pendingId === finding.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
