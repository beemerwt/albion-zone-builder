import { DEFAULT_PORT_NAMES } from "../lib/worldJson";
import SearchableDropdown, { Option } from "./SearchableDropdown";

export type PortRowState = {
  key: string;
  name: string;
  x: number;
  y: number;
  zoneId: string;
  port: string;
};

export default function PortRow({
  row,
  index,
  active,
  zoneOptions,
  portOptions,
  onChange,
  onRemove,
  onToggle,
}: {
  row: PortRowState;
  index: number;
  active: boolean;
  zoneOptions: Option[];
  portOptions: string[];
  onChange: (index: number, row: PortRowState) => void;
  onRemove: (index: number) => void;
  onToggle: (index: number) => void;
}) {
  const allPorts = [...new Set([...portOptions, ...DEFAULT_PORT_NAMES])].map((v) => ({
    value: v,
    label: v,
  }));

  return (
    <div className="card p-2 mb-2">
      <div className="row g-2 align-items-end">
        <div className="col-md-3">
          <label className="form-label small">Name</label>
          <input
            className="form-control"
            maxLength={5}
            value={row.name}
            onChange={(e) =>
              onChange(index, { ...row, name: e.target.value.toUpperCase().slice(0, 5) })
            }
          />
        </div>
        <div className="col-md-3">
          <label className="form-label small">x, y</label>
          <input
            className="form-control"
            defaultValue={`${row.x.toFixed(4)}, ${row.y.toFixed(4)}`}
            onBlur={(e) => {
              const p = e.target.value.split(",").map((s) => Number(s.trim()));
              if (p.length === 2 && !Number.isNaN(p[0]) && !Number.isNaN(p[1]))
                onChange(index, {
                  ...row,
                  x: Math.max(0, Math.min(1, p[0])),
                  y: Math.max(0, Math.min(1, p[1])),
                });
            }}
          />
        </div>
        <div className="col-md-3">
          <button
            className={`btn w-100 ${active ? "btn-warning" : "btn-outline-primary"}`}
            onClick={() => onToggle(index)}
          >
            Click to set
          </button>
        </div>
      </div>
      <div className="row g-2 align-items-end mt-1">
        <div className="col-md-6">
          <label className="form-label small">Connect zone</label>
          <SearchableDropdown
            options={zoneOptions}
            value={row.zoneId}
            onChange={(v) => onChange(index, { ...row, zoneId: v })}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label small">Port</label>
          <SearchableDropdown
            options={allPorts}
            value={row.port}
            onChange={(v) => onChange(index, { ...row, port: v.toUpperCase() })}
          />
        </div>
        <div className="col-md-2">
          <button className="btn btn-outline-danger w-100" onClick={() => onRemove(index)}>
            X
          </button>
        </div>
      </div>
    </div>
  );
}
