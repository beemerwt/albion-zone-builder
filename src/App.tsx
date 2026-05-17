import { useMemo, useState } from "react";
import MapCanvas from "./components/MapCanvas";
import PortsEditor from "./components/PortsEditor";
import SearchableDropdown from "./components/SearchableDropdown";
import Toolbar from "./components/Toolbar";
import { applyAffine, clamp01, computeAffine, fallbackCorners } from "./lib/affine";
import { detectMapBoundsWithOpenCv } from "./lib/mapBounds";
import { loadOpenCv } from "./lib/opencvLoader";
import { PortData, WorldJson, Zone } from "./lib/types";
import { downloadJson, parseWorldFile } from "./lib/worldJson";
import { PortRowState } from "./components/PortRow";

function portsToRows(zone?: Zone): PortRowState[] {
  return Object.entries(zone?.ports ?? {}).map(([name, p], i) => ({
    key: `${name}-${i}`,
    name,
    x: p.x ?? 0,
    y: p.y ?? 0,
    zoneId: p.connectsTo?.zoneId ?? "",
    port: p.connectsTo?.port ?? "",
  }));
}

export default function App() {
  const [world, setWorld] = useState<WorldJson | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<Record<string, [number, number]> | null>(null);
  const [affine, setAffine] = useState<any>(null);
  const [rows, setRows] = useState<PortRowState[]>([]);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [status, setStatus] = useState("Open world.json and screenshot.");

  const zones = world?.zones ?? [];
  const zoneByName = useMemo(
    () => Object.fromEntries(zones.map((z) => [String(z.name ?? z.id ?? ""), z])),
    [zones],
  );
  const zone = zoneByName[zoneName] as Zone | undefined;

  const zoneOptions = Object.keys(zoneByName)
    .sort()
    .map((v) => ({ value: v, label: v }));
  const zoneIdOptions = zones
    .map((z) => String(z.id ?? ""))
    .filter(Boolean)
    .sort()
    .map((v) => ({ value: v, label: v }));

  const syncZone = (nextRows: PortRowState[]) => {
    if (!world || !zone) return;
    const ports: Record<string, PortData> = {};
    for (const r of nextRows) {
      const n = r.name.trim().toUpperCase().slice(0, 5);
      if (!n) continue;
      ports[n] = {
        x: clamp01(r.x),
        y: clamp01(r.y),
        connectsTo: { zoneId: r.zoneId ?? "", port: (r.port ?? "").toUpperCase() },
      };
    }
    const nextZones = world.zones.map((z) => (z === zone ? { ...z, ports } : z));
    setWorld({ ...world, zones: nextZones });
  };

  const onSelectZone = (name: string) => {
    setZoneName(name);
    setRows(portsToRows(zoneByName[name] as Zone));
    setSelecting(null);
  };

  return (
    <div className="vh-100 d-flex flex-column">
      <Toolbar
        status={status}
        onWorld={async (file) => {
          const parsed = await parseWorldFile(file);
          setWorld(parsed);
          const first =
            parsed.zones
              .map((z) => String(z.name ?? z.id ?? ""))
              .filter(Boolean)
              .sort()[0] ?? "";
          if (first) onSelectZone(first);
          setStatus(`Loaded ${parsed.zones.length} zones.`);
        }}
        onImage={(file) => {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = async () => {
            setImage(img);
            try {
              const cv = await loadOpenCv();
              const detected = detectMapBoundsWithOpenCv(cv, img);
              setCorners(detected.corners as any);
              setAffine(computeAffine(detected.corners as any));
              setStatus(
                `Detected map bounds (+${detected.positiveLineCount}/-${detected.negativeLineCount}).`,
              );
            } catch {
              const c = fallbackCorners(img.width, img.height);
              setCorners(c);
              setAffine(computeAffine(c));
              setStatus("OpenCV detection failed; using fallback corners.");
            }
          };
          img.src = url;
        }}
        onExport={() => world && downloadJson("world.updated.json", world)}
      />

      <div className="flex-grow-1 d-flex overflow-hidden">
        <div className="border-end p-2" style={{ overflow: "auto", minWidth: 0 }}>
          <label className="form-label small">Zone</label>
          <SearchableDropdown
            options={zoneOptions}
            value={zoneName}
            onChange={onSelectZone}
            isDisabled={!world}
          />
          <div className="mt-2">
            <PortsEditor
              rows={rows}
              selecting={selecting}
              zoneOptions={zoneIdOptions}
              portOptions={zone ? Object.keys(zone.ports ?? {}) : []}
              onAdd={() => {
                const next = [
                  ...rows,
                  { key: crypto.randomUUID(), name: "NE", x: 0, y: 0, zoneId: "", port: "" },
                ];
                setRows(next);
                syncZone(next);
              }}
              onChange={(index, row) => {
                const next = rows.map((r, i) => (i === index ? row : r));
                setRows(next);
                syncZone(next);
              }}
              onRemove={(index) => {
                const next = rows.filter((_, i) => i !== index);
                setRows(next);
                syncZone(next);
              }}
              onToggle={(index) => setSelecting(selecting === index ? null : index)}
            />
          </div>
        </div>
        <div className="flex-grow-1" style={{ minWidth: 320 }}>
          <MapCanvas
            image={image}
            corners={corners}
            ports={rows.map((r) => ({ name: r.name, x: r.x, y: r.y }))}
            project={(u, v) => (affine ? applyAffine(affine.fwd, clamp01(u), clamp01(v)) : null)}
            onClick={(ix, iy) => {
              if (selecting === null || !affine) return;
              const [u, v] = applyAffine(affine.inv, ix, iy);
              const next = rows.map((r, i) =>
                i === selecting ? { ...r, x: clamp01(u), y: clamp01(v) } : r,
              );
              setRows(next);
              setSelecting(null);
              syncZone(next);
            }}
          />
        </div>
      </div>
    </div>
  );
}
