import PortRow, { PortRowState } from "./PortRow";
import { Option } from "./SearchableDropdown";

export default function PortsEditor({
  rows,
  selecting,
  zoneOptions,
  zonePortsByZoneId,
  onAdd,
  onChange,
  onRemove,
  onToggle,
}: {
  rows: PortRowState[];
  selecting: number | null;
  zoneOptions: Option[];
  zonePortsByZoneId: Record<string, string[]>;
  onAdd: () => void;
  onChange: (index: number, row: PortRowState) => void;
  onRemove: (index: number) => void;
  onToggle: (index: number) => void;
}) {
  return (
    <div>
      {rows.map((r, i) => (
        <PortRow
          key={r.key}
          row={r}
          index={i}
          active={selecting === i}
          zoneOptions={zoneOptions}
          portOptions={zonePortsByZoneId[r.zoneId] ?? []}
          onChange={onChange}
          onRemove={onRemove}
          onToggle={onToggle}
        />
      ))}
      <button className="btn btn-sm btn-outline-success" onClick={onAdd}>
        Add Port
      </button>
    </div>
  );
}
