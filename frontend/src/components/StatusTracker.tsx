import type { WorksheetStatus } from '../types';

interface StatusTrackerProps {
  status: WorksheetStatus | null;
  error: string | null;
  worksheetId: string | null;
  onReset?: () => void;
}

const STEPS: Array<{ key: WorksheetStatus; label: string; description: string }> = [
  { key: 'extracting', label: 'Extracting', description: 'Reading the worksheet content' },
  { key: 'generating', label: 'Generating', description: 'Creating structured Manual' },
  { key: 'compiling', label: 'Compiling', description: 'Building the PDF output' },
  { key: 'ready', label: 'Ready', description: 'Manual is prepared for download' }
];

function StatusTracker({ status, error, worksheetId, onReset }: StatusTrackerProps) {
  if (!worksheetId) {
    return (
      <div className="status-empty">
        <p>No job started yet.</p>
        <p className="muted">Upload a worksheet to see live progress.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-error">
        <strong>Something went wrong.</strong>
        <p>{error}</p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="status-error">
        <strong>Job failed.</strong>
        <p>Please try again or upload a different file.</p>
      </div>
    );
  }

  const statusIndex = status ? STEPS.findIndex((step) => step.key === status) : -1;

  return (
    <div className="status-tracker">
      <div className="status-meta">
        <span>Job ID</span>
        <code>{worksheetId}</code>
        {onReset && (
          <button className="button" type="button" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
      <div className="status-steps">
        {STEPS.map((step, index) => {
          const isActive = status === step.key;
          const isComplete = statusIndex > index;

          return (
            <div
              key={step.key}
              className={`status-step ${isActive ? 'active' : ''} ${isComplete ? 'done' : ''}`}
            >
              <div className="step-badge">{index + 1}</div>
              <div>
                <h4>{step.label}</h4>
                <p>{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      {status && status !== 'ready' && (
        <p className="muted">Current status: {status}</p>
      )}
    </div>
  );
}

export default StatusTracker;
