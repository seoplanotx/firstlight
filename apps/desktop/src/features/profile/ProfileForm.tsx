import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BIOMARKER_SUGGESTIONS,
  CANCER_TYPE_SUGGESTIONS,
  THERAPY_SUGGESTIONS
} from '../../lib/clinicalSuggestions';
import type { Biomarker, PatientProfile, TherapyHistoryEntry } from '../../lib/types';

type ProfileFormProps = {
  initialValue?: PatientProfile | null;
  onSave: (profile: PatientProfile) => Promise<void>;
  submitLabel?: string;
  /** Fired whenever the form deviates from (or returns to) its last-saved state. */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * 'essentials' shows only the fields needed to begin (name, cancer type,
   * location). Everything else lives on the "improve matching later" path and is
   * reachable afterward from Patient Details. Defaults to the full editor.
   */
  variant?: 'full' | 'essentials';
};

function blankBiomarker(): Biomarker {
  return { name: '', variant: '', status: '', notes: '' };
}

function blankTherapy(): TherapyHistoryEntry {
  return { therapy_name: '', therapy_type: '', line_of_therapy: '', status: '', notes: '' };
}

const defaultProfile: PatientProfile = {
  profile_name: '',
  display_name: '',
  date_of_birth: '',
  cancer_type: '',
  subtype: '',
  stage_or_context: '',
  current_therapy_status: '',
  location_label: '',
  travel_radius_miles: 100,
  notes: '',
  would_consider: [],
  would_not_consider: [],
  is_active: true,
  biomarkers: [blankBiomarker()],
  therapy_history: [blankTherapy()]
};

type StrengthLevel = {
  label: string;
  ratio: number;
  tone: 'basic' | 'good' | 'strong';
  message: string;
};

// The matching engine leans most on cancer type, biomarkers, stage, prior
// therapy, and location. Reflect that back so the user understands which
// details improve results — without ever pressuring them to guess.
function computeStrength(form: PatientProfile): StrengthLevel {
  const signals = [
    Boolean(form.cancer_type.trim()),
    form.biomarkers.some((item) => item.name.trim()),
    Boolean((form.stage_or_context || '').trim()),
    form.therapy_history.some((item) => item.therapy_name.trim()),
    Boolean((form.location_label || '').trim())
  ];
  const filled = signals.filter(Boolean).length;
  const ratio = filled / signals.length;
  if (filled <= 1) {
    return {
      label: 'Basic',
      ratio,
      tone: 'basic',
      message: 'Adding biomarkers, stage, and recent therapy will help Firstlight find more relevant matches.'
    };
  }
  if (filled <= 3) {
    return {
      label: 'Good',
      ratio,
      tone: 'good',
      message: 'Good detail. A few more facts — like biomarkers or location — can sharpen the matches further.'
    };
  }
  return {
    label: 'Strong',
    ratio,
    tone: 'strong',
    message: 'Strong detail. Firstlight has what it needs to match trials and research closely.'
  };
}

export function ProfileForm({
  initialValue,
  onSave,
  submitLabel = 'Save profile',
  onDirtyChange,
  variant = 'full'
}: ProfileFormProps) {
  const essentials = variant === 'essentials';
  const [form, setForm] = useState<PatientProfile>(initialValue || defaultProfile);
  const [saving, setSaving] = useState(false);
  const [cancerError, setCancerError] = useState('');
  const cancerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setForm(initialValue || defaultProfile);
  }, [initialValue]);

  const considerText = useMemo(() => form.would_consider.join('\n'), [form.would_consider]);
  const avoidText = useMemo(() => form.would_not_consider.join('\n'), [form.would_not_consider]);
  const strength = useMemo(() => computeStrength(form), [form]);

  // Compare the live form against its last-saved baseline so the parent can warn
  // before the user navigates away from unsaved edits.
  const baseline = useMemo(() => JSON.stringify(initialValue || defaultProfile), [initialValue]);
  const isDirty = useMemo(() => JSON.stringify(form) !== baseline, [form, baseline]);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.cancer_type.trim()) {
      setCancerError('Add the cancer type so Firstlight knows what to look for. Plain words are fine.');
      cancerInputRef.current?.focus();
      return;
    }
    setCancerError('');
    setSaving(true);
    try {
      await onSave({
        ...form,
        date_of_birth: form.date_of_birth || null,
        display_name: form.display_name || null,
        subtype: form.subtype || null,
        stage_or_context: form.stage_or_context || null,
        current_therapy_status: form.current_therapy_status || null,
        location_label: form.location_label || null,
        notes: form.notes || null,
        biomarkers: form.biomarkers.filter((item) => item.name.trim()),
        therapy_history: form.therapy_history.filter((item) => item.therapy_name.trim())
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      {essentials ? (
        <div className="callout field-span-2">
          Start with just the basics below. You can add biomarkers, stage, therapy history, and more later from Patient
          Details — Firstlight will remind you when those details would sharpen the matches.
        </div>
      ) : (
        <div className={`profile-strength profile-strength-${strength.tone} field-span-2`}>
          <div className="profile-strength-head">
            <strong>Match strength: {strength.label}</strong>
            <span className="muted">More detail finds better matches — but leaving something blank is always safer than guessing.</span>
          </div>
          <div className="profile-strength-track" aria-hidden="true">
            <div className="profile-strength-bar" style={{ width: `${Math.round(strength.ratio * 100)}%` }} />
          </div>
          <div className="muted">{strength.message}</div>
        </div>
      )}

      <div className="field">
        <label htmlFor="profile-name" className="required-field">Who is this profile for?</label>
        <input id="profile-name" value={form.profile_name} onChange={(e) => setForm({ ...form, profile_name: e.target.value })} required />
        <div className="field-hint">A name or label only you see — for example "Mom", "Dad's lung cancer", or the patient's first name.</div>
      </div>
      <div className="field">
        <label htmlFor="profile-display-name">Short name for your daily check</label>
        <input id="profile-display-name" value={form.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <div className="field-hint">Optional. Shown at the top of your daily check. Initials are fine.</div>
      </div>
      {!essentials && (
        <div className="field">
          <label htmlFor="profile-date-of-birth">Date of birth</label>
          <input id="profile-date-of-birth" type="date" value={form.date_of_birth || ''} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          <div className="field-hint">Optional. Stays encrypted on this computer.</div>
        </div>
      )}
      <div className="field">
        <label htmlFor="profile-cancer-type" className="required-field">Cancer type</label>
        <input
          id="profile-cancer-type"
          ref={cancerInputRef}
          list="cancer-type-options"
          value={form.cancer_type}
          onChange={(e) => {
            if (cancerError) setCancerError('');
            setForm({ ...form, cancer_type: e.target.value });
          }}
          aria-required={true}
          aria-invalid={cancerError ? true : undefined}
          aria-describedby={cancerError ? 'profile-cancer-type-error' : undefined}
        />
        <datalist id="cancer-type-options">
          {CANCER_TYPE_SUGGESTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        {cancerError ? (
          <div className="field-error" id="profile-cancer-type-error" role="alert">
            {cancerError}
          </div>
        ) : (
          <div className="field-hint">
            In plain words is fine, e.g. "colon cancer" or "non-small cell lung cancer". Start typing to see common
            examples — you can also type your own.
          </div>
        )}
      </div>
      {!essentials && (
        <>
          <div className="field">
            <label htmlFor="profile-subtype">Subtype</label>
            <input id="profile-subtype" value={form.subtype || ''} onChange={(e) => setForm({ ...form, subtype: e.target.value })} />
            <div className="field-hint">Optional, if a doctor named one — e.g. "adenocarcinoma". Leave blank if unsure.</div>
          </div>
          <div className="field">
            <label htmlFor="profile-stage">Stage / disease context</label>
            <input id="profile-stage" value={form.stage_or_context || ''} onChange={(e) => setForm({ ...form, stage_or_context: e.target.value })} />
            <div className="field-hint">e.g. "Stage 4", "metastatic", or "newly diagnosed". Whatever the care team has said.</div>
          </div>
          <details className="form-help field-span-2">
            <summary>Not sure about subtype or stage?</summary>
            <p>
              These are optional. The <strong>subtype</strong> is a more specific name a pathologist may have used (for
              example "adenocarcinoma" or "squamous cell"). The <strong>stage</strong> describes how far the cancer has
              spread (for example "Stage 4" or "metastatic"). Both usually appear near the top of a pathology or imaging
              report. If you are not certain, leave them blank — that is safer than guessing.
            </p>
          </details>
          <div className="field field-span-2">
            <label htmlFor="profile-therapy-status">Current therapy status</label>
            <textarea id="profile-therapy-status" value={form.current_therapy_status || ''} onChange={(e) => setForm({ ...form, current_therapy_status: e.target.value })} rows={2} />
            <div className="field-hint">A sentence on where things stand now — e.g. "on chemo" or "deciding what's next".</div>
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="profile-location">Location</label>
        <input id="profile-location" value={form.location_label || ''} onChange={(e) => setForm({ ...form, location_label: e.target.value })} />
        <div className="field-hint">City and state is enough — used to flag trials within travel range.</div>
      </div>
      {!essentials && (
        <div className="field">
          <label htmlFor="profile-travel-radius">Travel radius (miles)</label>
          <input
            id="profile-travel-radius"
            type="number"
            value={form.travel_radius_miles || 0}
            onChange={(e) => setForm({ ...form, travel_radius_miles: Number(e.target.value) })}
          />
          <div className="field-hint">How far you would travel for a trial, roughly.</div>
        </div>
      )}

      {!essentials && (
      <>
      <h4 className="section-divider field-span-2">Biomarkers / mutations</h4>
      <div className="field-hint field-span-2">
        These come from a pathology, genetic, or molecular test report from the care team. Examples: KRAS G12C, EGFR,
        BRAF, MSI-High, PD-L1. They matter a lot for matching — but if you don't have them yet, leave this blank and add
        them later.
      </div>
      <details className="form-help field-span-2">
        <summary>What's a biomarker, and where do I find it?</summary>
        <p>
          A biomarker is a specific gene change or marker found by testing a tumor sample or blood — things like
          <strong> EGFR</strong>, <strong>KRAS</strong>, <strong>HER2</strong>, or <strong>PD-L1</strong>. They often
          decide which trials and targeted treatments are relevant, so they help Firstlight a lot.
        </p>
        <p>
          Look for a section titled "molecular", "genomic", "next-generation sequencing (NGS)", or "biomarker results"
          on a pathology or lab report. Enter the name (start typing for common examples), and add the variant or status
          only if it's written down. If you don't have these results yet, leave this blank and add them later.
        </p>
      </details>
      <datalist id="biomarker-options">
        {BIOMARKER_SUGGESTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {form.biomarkers.map((item, index) => (
        <div key={`bio-${index}`} className="row-card">
          <div className="row-card-grid">
            <div className="field">
              <label htmlFor={`biomarker-${index}-name`}>Name</label>
              <input
                id={`biomarker-${index}-name`}
                list="biomarker-options"
                placeholder="e.g. EGFR"
                value={item.name}
                onChange={(e) => {
                  const biomarkers = [...form.biomarkers];
                  biomarkers[index] = { ...item, name: e.target.value };
                  setForm({ ...form, biomarkers });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor={`biomarker-${index}-variant`}>Variant</label>
              <input
                id={`biomarker-${index}-variant`}
                placeholder="e.g. Exon 19 deletion"
                value={item.variant || ''}
                onChange={(e) => {
                  const biomarkers = [...form.biomarkers];
                  biomarkers[index] = { ...item, variant: e.target.value };
                  setForm({ ...form, biomarkers });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor={`biomarker-${index}-status`}>Status</label>
              <input
                id={`biomarker-${index}-status`}
                placeholder="e.g. positive"
                value={item.status || ''}
                onChange={(e) => {
                  const biomarkers = [...form.biomarkers];
                  biomarkers[index] = { ...item, status: e.target.value };
                  setForm({ ...form, biomarkers });
                }}
              />
            </div>
          </div>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              const next = form.biomarkers.filter((_, idx) => idx !== index);
              setForm({ ...form, biomarkers: next.length ? next : [blankBiomarker()] });
            }}
          >
            Remove biomarker
          </button>
        </div>
      ))}
      <button type="button" className="secondary-button field-span-2" onClick={() => setForm({ ...form, biomarkers: [...form.biomarkers, blankBiomarker()] })}>
        Add biomarker
      </button>

      <h4 className="section-divider field-span-2">Therapy history</h4>
      <div className="field-hint field-span-2">
        Treatments tried so far, most recent first if you can. The drug or treatment name is the important part — the
        rest is optional. Start typing for common examples, or type your own.
      </div>
      <datalist id="therapy-options">
        {THERAPY_SUGGESTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {form.therapy_history.map((item, index) => (
        <div key={`therapy-${index}`} className="row-card">
          <div className="row-card-grid">
            <div className="field">
              <label htmlFor={`therapy-${index}-name`}>Therapy</label>
              <input
                id={`therapy-${index}-name`}
                list="therapy-options"
                placeholder="e.g. carboplatin"
                value={item.therapy_name}
                onChange={(e) => {
                  const therapy_history = [...form.therapy_history];
                  therapy_history[index] = { ...item, therapy_name: e.target.value };
                  setForm({ ...form, therapy_history });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor={`therapy-${index}-type`}>Type</label>
              <input
                id={`therapy-${index}-type`}
                placeholder="e.g. chemotherapy"
                value={item.therapy_type || ''}
                onChange={(e) => {
                  const therapy_history = [...form.therapy_history];
                  therapy_history[index] = { ...item, therapy_type: e.target.value };
                  setForm({ ...form, therapy_history });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor={`therapy-${index}-line`}>Line of therapy</label>
              <input
                id={`therapy-${index}-line`}
                placeholder="e.g. 1st line"
                value={item.line_of_therapy || ''}
                onChange={(e) => {
                  const therapy_history = [...form.therapy_history];
                  therapy_history[index] = { ...item, line_of_therapy: e.target.value };
                  setForm({ ...form, therapy_history });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor={`therapy-${index}-status`}>Status</label>
              <input
                id={`therapy-${index}-status`}
                placeholder="e.g. completed"
                value={item.status || ''}
                onChange={(e) => {
                  const therapy_history = [...form.therapy_history];
                  therapy_history[index] = { ...item, status: e.target.value };
                  setForm({ ...form, therapy_history });
                }}
              />
            </div>
          </div>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              const next = form.therapy_history.filter((_, idx) => idx !== index);
              setForm({ ...form, therapy_history: next.length ? next : [blankTherapy()] });
            }}
          >
            Remove therapy entry
          </button>
        </div>
      ))}
      <button type="button" className="secondary-button field-span-2" onClick={() => setForm({ ...form, therapy_history: [...form.therapy_history, blankTherapy()] })}>
        Add therapy
      </button>

      <div className="field">
        <label htmlFor="profile-would-consider">Would consider</label>
        <textarea
          id="profile-would-consider"
          rows={2}
          value={considerText}
          onChange={(e) =>
            setForm({
              ...form,
              would_consider: e.target.value
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean)
            })
          }
        />
        <div className="field-hint">Options you're open to, one per line — e.g. "clinical trials", "travel for treatment".</div>
      </div>
      <div className="field">
        <label htmlFor="profile-would-not-consider">Would not consider</label>
        <textarea
          id="profile-would-not-consider"
          rows={2}
          value={avoidText}
          onChange={(e) =>
            setForm({
              ...form,
              would_not_consider: e.target.value
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean)
            })
          }
        />
        <div className="field-hint">Anything to rule out, one per line. Firstlight will flag items that conflict with these.</div>
      </div>
      <div className="field field-span-2">
        <label htmlFor="profile-notes">Notes</label>
        <textarea id="profile-notes" value={form.notes || ''} rows={3} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="field-hint">Anything else worth remembering. You can paste notes from a doctor's report here too.</div>
      </div>
      </>
      )}
      <div className="field-span-2">
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
