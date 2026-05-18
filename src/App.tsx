import { useEffect, useMemo, useState } from "react";
import ImageViewer from "./components/ImageViewer";
import PortsEditor from "./components/PortsEditor";
import SearchableDropdown from "./components/SearchableDropdown";
import Toolbar from "./components/Toolbar";
import Modal from "./components/Modal";
import { applyAffine, clamp01, computeAffine, fallbackCorners } from "./lib/affine";
import { detectMapBoundsWithOpenCv } from "./lib/mapBounds";
import { PortData, WorldJson, Zone } from "./lib/types";
import {
  downloadJson,
  fetchServerWorld,
  loadWorldFromLocalStorage,
  normalizeZoneName,
  saveWorldToLocalStorage,
  zoneIdFromName,
} from "./lib/worldJson";
import { detectMapBoundsWithWasm } from "./lib/wasmMapBounds";
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
  const [zoneId, setZoneId] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<Record<string, [number, number]> | null>(null);
  const [affine, setAffine] = useState<any>(null);
  const [rows, setRows] = useState<PortRowState[]>([]);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [status, setStatus] = useState("Loading world.json...");
  const [detecting, setDetecting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const zones = world?.zones ?? [];
  const zoneById = useMemo(
    () => Object.fromEntries(zones.map((z) => [String(z.id ?? ""), z]).filter(([id]) => id)),
    [zones],
  );
  const zoneNameSet = useMemo(
    () =>
      new Set(
        zones
          .map((z) =>
            String(z.name ?? "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    [zones],
  );
  const zone = zoneById[zoneId] as Zone | undefined;
  const zonePortsByZoneId = useMemo(
    () =>
      Object.fromEntries(
        zones.map((z) => [String(z.id ?? ""), Object.keys(z.ports ?? {})]).filter(([id]) => id),
      ),
    [zones],
  );

  const zoneOptions = zones
    .map((z) => ({ value: String(z.id ?? ""), label: String(z.name ?? z.id ?? "") }))
    .filter((z) => z.value)
    .sort((a, b) => a.label.localeCompare(b.label));
  const zoneIdOptions = zones
    .map((z) => String(z.id ?? ""))
    .filter(Boolean)
    .sort()
    .map((v) => ({ value: v, label: v }));

  const persistWorld = (next: WorldJson) => {
    setWorld(next);
    if (!saveWorldToLocalStorage(next)) {
      setStatus("Warning: could not save world changes to localStorage.");
    }
  };

  const selectZoneById = (nextZoneId: string, nextWorld?: WorldJson | null) => {
    const activeWorld = nextWorld ?? world;
    if (!activeWorld) return;
    const selectedZone = activeWorld.zones.find((z) => String(z.id ?? "") === nextZoneId);
    setZoneId(nextZoneId);
    setRows(portsToRows(selectedZone));
    setSelecting(null);
  };

  useEffect(() => {
    let mounted = true;
    const loadWorld = async () => {
      const cached = loadWorldFromLocalStorage();
      if (cached) {
        if (!mounted) return;
        setWorld(cached);
        setZoneId("");
        setRows([]);
        setStatus(`Loaded ${cached.zones.length} zones from local cache.`);
        return;
      }

      try {
        const serverWorld = await fetchServerWorld();
        if (!mounted) return;
        persistWorld(serverWorld);
        setZoneId("");
        setRows([]);
        setStatus(`Loaded ${serverWorld.zones.length} zones from /world.json.`);
      } catch (error) {
        console.error(error);
        if (!mounted) return;
        setStatus("Failed to load world data from local cache or /world.json.");
      }
    };

    loadWorld();
    return () => {
      mounted = false;
    };
  }, []);

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
    persistWorld({ ...world, zones: nextZones });
  };

  const onAddZoneSubmit = () => {
    const displayName = normalizeZoneName(addName);
    const id = zoneIdFromName(addName);
    if (!displayName || !id) {
      setAddError("No zone name was provided.");
      return;
    }
    if (zoneById[id] || zoneNameSet.has(displayName.toLowerCase())) {
      setAddError("Zone already exists");
      return;
    }
    if (!world) return;

    const newZone: Zone = {
      id,
      name: displayName,
      type: "unknown",
      biome: "unknown",
      tier: 1,
      ports: {},
    };
    const nextWorld = { ...world, zones: [...world.zones, newZone] };
    persistWorld(nextWorld);
    selectZoneById(id, nextWorld);
    setAddOpen(false);
    setAddName("");
    setAddError("");
    setStatus(`Added zone ${displayName}.`);
  };

  const onDeleteZone = () => {
    if (!world || !zoneId) return;
    const nextZones = world.zones.filter((z) => String(z.id ?? "") !== zoneId);
    // TODO: Deleting a zone can leave dangling connectsTo.zoneId references in other zones.
    const nextWorld = { ...world, zones: nextZones };
    persistWorld(nextWorld);
    const fallbackId = nextZones
      .map((z) => String(z.id ?? ""))
      .filter(Boolean)
      .sort()[0];
    if (fallbackId) {
      selectZoneById(fallbackId, nextWorld);
    } else {
      setZoneId("");
      setRows([]);
      setSelecting(null);
    }
    setDeleteOpen(false);
    setStatus("Deleted selected zone.");
  };

  return (
    <div className="vh-100 d-flex flex-column">
      <Toolbar
        status={status}
        canEditWorld={Boolean(world)}
        canDeleteZone={Boolean(world && zoneId)}
        onOpenAddZone={() => setAddOpen(true)}
        onOpenDeleteZone={() => setDeleteOpen(true)}
        onClearCache={async () => {
          try {
            const serverWorld = await fetchServerWorld();
            persistWorld(serverWorld);
            setZoneId("");
            setRows([]);
            setSelecting(null);
            setStatus("Cache cleared and reloaded from /world.json.");
          } catch (error) {
            console.error(error);
            setStatus("Failed to clear cache: unable to reload /world.json.");
          }
        }}
        onImage={(file) => {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = async () => {
            setImage(img);
            setDetecting(true);
            setStatus("Detecting map bounds...");
            try {
              const detected = await detectMapBoundsWithWasm(img);
              setCorners(detected.corners as any);
              setAffine(computeAffine(detected.corners as any));
              setStatus(
                `Detected map bounds with WASM (+${detected.positiveLineCount}/-${detected.negativeLineCount}).`,
              );
            } catch (wasmError) {
              console.error("WASM map-bound detection failed", wasmError);
              try {
                const detected = await detectMapBoundsWithOpenCv(img);
                setCorners(detected.corners as any);
                setAffine(computeAffine(detected.corners as any));
                setStatus(
                  `Detected map bounds with OpenCV fallback (+${detected.positiveLineCount}/-${detected.negativeLineCount}).`,
                );
              } catch (opencvError) {
                console.error("OpenCV map-bound detection failed", opencvError);
                const c = fallbackCorners(img.width, img.height);
                setCorners(c);
                setAffine(computeAffine(c));
                setStatus("WASM and OpenCV detection failed; using fallback corners.");
              }
            } finally {
              setDetecting(false);
            }
          };
          img.src = url;
        }}
        onExport={() => world && downloadJson("world.updated.json", world)}
      />

      <div className="flex-grow-1 d-flex overflow-hidden">
        <div className="border-end p-2" style={{ overflow: "auto", minWidth: 421 }}>
          <label className="form-label small">Zone</label>
          <SearchableDropdown
            options={zoneOptions}
            value={zoneId}
            onChange={(id) => selectZoneById(id)}
            isDisabled={!world || detecting}
            placeholder="Select..."
          />
          <div className="mt-2">
            <PortsEditor
              rows={rows}
              selecting={selecting}
              zoneOptions={zoneIdOptions}
              zonePortsByZoneId={zonePortsByZoneId}
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
          <ImageViewer
            imageUrl={image?.src ?? null}
            imageWidth={image?.width}
            imageHeight={image?.height}
            resetKey={image?.src}
            onImageClick={({ x, y }) => {
              if (selecting === null || !affine) return;
              const [u, v] = applyAffine(affine.inv, x, y);
              const next = rows.map((r, i) =>
                i === selecting ? { ...r, x: clamp01(u), y: clamp01(v) } : r,
              );
              setRows(next);
              setSelecting(null);
              syncZone(next);
            }}
          >
            {corners && (
              <polygon
                points={["Top", "Right", "Bottom", "Left"]
                  .map((n) => `${corners[n][0]},${corners[n][1]}`)
                  .join(" ")}
                fill="none"
                stroke="cyan"
                strokeWidth={2}
              />
            )}
            {rows.map((r) => {
              const q = affine ? applyAffine(affine.fwd, clamp01(r.x), clamp01(r.y)) : null;
              if (!q) return null;
              return (
                <g key={r.key}>
                  <circle cx={q[0]} cy={q[1]} r={6} fill="red" />
                  <text x={q[0] + 8} y={q[1]} fill="white" fontSize="14" dominantBaseline="middle">
                    {r.name}
                  </text>
                </g>
              );
            })}
          </ImageViewer>
        </div>
      </div>

      <Modal
        open={addOpen}
        title="Add Zone"
        onClose={() => {
          setAddOpen(false);
          setAddName("");
          setAddError("");
        }}
      >
        <div className="modal-body">
          <input
            autoFocus
            className={`form-control ${addError ? "is-invalid" : ""}`}
            value={addName}
            onChange={(e) => {
              setAddName(e.target.value);
              setAddError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddZoneSubmit();
              if (e.key === "Escape") {
                setAddOpen(false);
                setAddName("");
                setAddError("");
              }
            }}
            placeholder="Zone name"
          />
          {addError && <div className="text-danger small mt-1">{addError}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary me-2 mt-2" onClick={onAddZoneSubmit}>
            OK
          </button>
          <button
            type="button"
            className="btn btn-secondary mt-2"
            onClick={() => {
              setAddOpen(false);
              setAddName("");
              setAddError("");
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <div className="modal-body">Are you sure you want to delete {zone?.name ?? zoneId}</div>
        <div className="modal-footer">
          <button type="button" className="btn btn-danger me-2 mt-2" onClick={onDeleteZone}>
            Yes
          </button>
          <button
            type="button"
            className="btn btn-secondary mt-2"
            onClick={() => setDeleteOpen(false)}
          >
            No
          </button>
        </div>
      </Modal>
    </div>
  );
}
