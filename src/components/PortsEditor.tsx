import PortRow, { PortRowState } from "./PortRow";
import { Option } from "./SearchableDropdown";

export default function PortsEditor({
  rows,
  selecting,
  zoneOptions,
  zonePortsByZoneId,
  isDisabled,
  onAdd,
  onChange,
  onRemove,
  onToggle,
}: {
  rows: PortRowState[];
  selecting: number | null;
  zoneOptions: Option[];
  zonePortsByZoneId: Record<string, string[]>;
  isDisabled: boolean;
  onAdd: () => void;
  onChange: (index: number, row: PortRowState) => void;
  onRemove: (index: number) => void;
  onToggle: (index: number) => void;
}) {
  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2">
        <label className="small flex-grow-1">Ports</label>
        <button
          className={"btn btn-sm btn-outline-success" + (isDisabled ? " disabled" : "")}
          onClick={onAdd}
        >
          Add Port
        </button>
      </div>

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
    </div>
  );
}
