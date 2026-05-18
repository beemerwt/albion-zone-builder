export default function Toolbar({
  onImage,
  onExport,
  onOpenAddZone,
  onOpenDeleteZone,
  onClearCache,
  status,
  canEditWorld,
  canDeleteZone,
}: {
  onImage: (file: File) => void;
  onExport: () => void;
  onOpenAddZone: () => void;
  onOpenDeleteZone: () => void;
  onClearCache: () => void;
  status: string;
  canEditWorld: boolean;
  canDeleteZone: boolean;
}) {
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
        className="btn btn-outline-warning btn-sm"
        onClick={onClearCache}
        disabled={!canEditWorld}
      >
        Clear Cache
      </button>
      <button className="btn btn-primary btn-sm" onClick={onExport} disabled={!canEditWorld}>
        Export JSON
      </button>
      <span className="small text-muted">{status}</span>
    </div>
  );
}
