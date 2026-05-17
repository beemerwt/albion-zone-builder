export default function Toolbar({ onWorld, onImage, onExport, status }: {
  onWorld: (file: File) => void;
  onImage: (file: File) => void;
  onExport: () => void;
  status: string;
}) {
  return <div className="p-2 border-bottom d-flex gap-2 align-items-center flex-wrap">
    <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && onWorld(e.target.files[0])} />
    <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
    <button className="btn btn-primary btn-sm" onClick={onExport}>Export JSON</button>
    <span className="small text-muted">{status}</span>
  </div>;
}
