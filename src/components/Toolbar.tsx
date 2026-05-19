import { useMemo, useState } from "react";
import { ValidationError } from "../lib/validateWorldJson";

export default function Toolbar({
  onImage,
  onExport,
  onValidate,
  validationErrors,
  onSelectValidationZone,
  onOpenAddZone,
  onOpenDeleteZone,
  onLoadWorld,
  onClearCache,
  status,
  canEditWorld,
  canDeleteZone,
}: {
  onImage: (file: File) => void;
  onExport: () => void;
  onValidate: () => void;
  validationErrors: ValidationError[] | null;
  onSelectValidationZone: (zoneId: string) => void;
  onOpenAddZone: () => void;
  onOpenDeleteZone: () => void;
  onLoadWorld: (file: File) => void;
  onClearCache: () => void;
  status: string;
  canEditWorld: boolean;
  canDeleteZone: boolean;
}) {
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  const hasValidationRun = validationErrors !== null;
  const hasErrors = (validationErrors?.length ?? 0) > 0;
  const knownZones = useMemo(
    () => new Set((validationErrors ?? []).flatMap((e) => e.linkedZoneIds)),
    [validationErrors],
  );

  return (
    <div className="p-2 border-bottom d-flex gap-2 align-items-center flex-wrap">
      <span className="small">Screenshot:</span>
      <label className="btn btn-outline-secondary btn-sm mb-0">
        Upload screenshot
        <input
          className="d-none"
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])}
        />
      </label>
      <button
        className="btn btn-outline-primary btn-sm"
        onClick={onOpenAddZone}
        disabled={!canEditWorld}
      >
        Add Zone
      </button>
      <button
        className="btn btn-outline-danger btn-sm"
        onClick={onOpenDeleteZone}
        disabled={!canDeleteZone}
      >
        Delete Zone
      </button>
      <button
        className="btn btn-outline-primary btn-sm"
        onClick={onValidate}
        disabled={!canEditWorld}
      >
        Validate JSON
      </button>
      <div className="position-relative">
        <button
          className={`btn btn-sm ${hasErrors ? "btn-danger" : "btn-outline-danger"}`}
          onClick={() => hasErrors && setShowValidationErrors((v) => !v)}
          disabled={!hasErrors}
        >
          {!hasValidationRun
            ? "Awaiting Validation"
            : hasErrors
              ? "Validation Errors"
              : "No Errors Present"}
        </button>
        {hasErrors && showValidationErrors && (
          <div
            className="position-absolute top-100 start-0 mt-1 p-2 border rounded bg-white shadow"
            style={{ zIndex: 1000, minWidth: 420, maxWidth: 640 }}
          >
            <ul className="mb-0 ps-3">
              {validationErrors?.map((error, index) => (
                <li key={`${error.type}-${index}`} className="small mb-1">
                  <span>
                    {error.message.split(/([a-z0-9-]+(?=:))/gi).map((part, i) => {
                      const isZoneToken = knownZones.has(part);
                      if (!isZoneToken) return <span key={i}>{part}</span>;
                      return (
                        <button
                          key={i}
                          type="button"
                          className="btn btn-link btn-sm p-0 align-baseline"
                          onClick={() => {
                            onSelectValidationZone(part);
                            setShowValidationErrors(false);
                          }}
                        >
                          {part}
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button className="btn btn-primary btn-sm" onClick={onExport} disabled={!canEditWorld}>
        Export JSON
      </button>
      <span className="small text-muted flex-grow-1">{status}</span>
      <label className="btn btn-outline-secondary btn-sm mb-0">
        Load World
        <input
          className="d-none"
          type="file"
          accept="application/json,.json"
          onChange={(e) => e.target.files?.[0] && onLoadWorld(e.target.files[0])}
        />
      </label>
      <button
        className="btn btn-outline-warning btn-sm"
        onClick={onClearCache}
        disabled={!canEditWorld}
      >
        Clear Cache
      </button>
    </div>
  );
}
