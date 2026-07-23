import { Badge } from './Badge';
import { EvidenceCallout } from './EvidenceCallout';
import { TrialDetailsGrid } from './TrialDetailsGrid';
import {
  formatFindingTypeLabel,
  formatRelevanceLabel,
  formatStatusLabel,
  relevanceTone,
  statusTone,
  typeTone
} from '../lib/findingPresentation';
import { useLanguageMode } from '../lib/languageMode';
import type { Finding, FindingAction } from '../lib/types';

type FindingSummaryCardProps = {
  finding: Finding;
  showWhy?: boolean;
  showSourceLink?: boolean;
  showMatchingMeta?: boolean;
  onAction?: (action: FindingAction) => void;
  actionPending?: boolean;
};

export function FindingSummaryCard({
  finding,
  showWhy = false,
  showSourceLink = true,
  showMatchingMeta = false,
  onAction,
  actionPending = false
}: FindingSummaryCardProps) {
  const mode = useLanguageMode();
  const timestamp = finding.published_at || finding.retrieved_at;
  const metaLine = [
    new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    finding.source_name,
    finding.external_identifier
  ]
    .filter(Boolean)
    .join('  ·  ');
  const supportingItems = [
    { label: 'Location context', value: finding.location_summary || 'Location details not stored.' },
    {
      label: mode === 'plain' ? 'How strong is this match?' : 'Relevance',
      value: formatRelevanceLabel(finding.relevance_label, mode)
    },
    {
      label: mode === 'plain' ? 'Still missing' : 'Missing information',
      value: finding.matching_gaps.length ? finding.matching_gaps.join(' ') : 'No structured gaps stored.'
    }
  ];

  const isDiscuss = finding.user_action === 'discuss';
  const isDismissed = finding.user_action === 'dismissed';

  return (
    <article className={`finding-item${isDismissed ? ' finding-item-dismissed' : ''}`}>
      <div className="finding-topline">
        <div className="finding-heading">
          <h3 className="finding-title">{finding.title}</h3>
          <p className="finding-meta-line">{metaLine}</p>
        </div>
        <div className="badge-row">
          <Badge label={formatFindingTypeLabel(finding.type)} tone={typeTone(finding.type)} />
          <Badge label={formatStatusLabel(finding.status, mode)} tone={statusTone(finding.status)} />
          <Badge label={formatRelevanceLabel(finding.relevance_label, mode)} tone={relevanceTone(finding.relevance_label)} />
          {isDiscuss && <Badge label="To discuss" tone="success" />}
        </div>
      </div>

      <p className="finding-summary">{finding.normalized_summary || finding.raw_summary || 'No summary available.'}</p>

      <TrialDetailsGrid finding={finding} />

      {showMatchingMeta && (
        <div className="detail-grid finding-support-grid">
          {supportingItems.map((item) => (
            <div className="support-card" key={item.label}>
              <div className="support-card-label">{item.label}</div>
              <div>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <EvidenceCallout finding={finding} />

      {showWhy && (
        <div className="detail-grid finding-rationale-grid">
          <div className="support-card">
            <div className="support-card-label">{mode === 'plain' ? 'Why this came up' : 'Why it surfaced'}</div>
            <div className="multiline">{finding.why_it_surfaced || 'No structured rationale stored.'}</div>
          </div>
          <div className="support-card caution">
            <div className="support-card-label">{mode === 'plain' ? 'Why it might not fit' : 'Why it may not fit'}</div>
            <div className="multiline">{finding.why_it_may_not_fit || 'No cautions stored.'}</div>
          </div>
        </div>
      )}

      <div className="finding-footer">
        {showSourceLink && finding.source_url && (
          <a href={finding.source_url} target="_blank" rel="noreferrer" className="source-link">
            Open source record
          </a>
        )}
        {onAction && (
          <div className="finding-actions">
            {isDismissed ? (
              <button className="ghost-button" disabled={actionPending} onClick={() => onAction('none')}>
                Restore
              </button>
            ) : (
              <>
                <button
                  className={isDiscuss ? 'secondary-button' : 'ghost-button'}
                  disabled={actionPending}
                  onClick={() => onAction(isDiscuss ? 'none' : 'discuss')}
                >
                  {isDiscuss ? 'Remove from list' : 'Ask the doctor about this'}
                </button>
                <button className="ghost-button" disabled={actionPending} onClick={() => onAction('dismissed')}>
                  Set aside
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
