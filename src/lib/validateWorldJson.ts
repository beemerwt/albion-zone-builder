import { WorldJson, Zone } from "./types";

export type ValidationErrorType =
  | "invalid-zone"
  | "invalid-port"
  | "invalid-connection"
  | "multiple-connections"
  | "missing-connection";

export type ValidationError = {
  type: ValidationErrorType;
  message: string;
  source?: { zoneId: string; portId: string };
  target?: { zoneId: string; portId: string };
  linkedZoneIds: string[];
};

export type ValidationResult = { errors: ValidationError[] };

type Connection = { zoneId: string; portId: string };

function toConnection(value: unknown): Connection | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const zoneId = typeof obj.zoneId === "string" ? obj.zoneId.trim() : "";
  const portId = typeof obj.port === "string" ? obj.port.trim().toUpperCase() : "";
  if (!zoneId || !portId) return null;
  return { zoneId, portId };
}

function readConnections(port: Record<string, unknown>): {
  connections: Connection[];
  malformed: boolean;
} {
  const rawValues = [port.connectsTo, port.connectTo].filter((v) => v !== undefined);
  if (rawValues.length === 0) return { connections: [], malformed: false };

  const values = rawValues.flatMap((v) => (Array.isArray(v) ? v : [v]));
  const validConnections = values.map(toConnection).filter((v): v is Connection => Boolean(v));
  return { connections: validConnections, malformed: validConnections.length !== values.length };
}

function zoneMap(world: WorldJson): Record<string, Zone> {
  return Object.fromEntries(world.zones.map((z) => [String(z.id ?? ""), z]).filter(([id]) => id));
}

export function validateWorldJson(world: WorldJson): ValidationResult {
  const zonesById = zoneMap(world);
  const errors: ValidationError[] = [];

  for (const [sourceZoneId, zone] of Object.entries(zonesById)) {
    const ports = zone.ports ?? {};
    for (const [sourcePortId, portData] of Object.entries(ports)) {
      const portRecord = (portData ?? {}) as Record<string, unknown>;
      const { connections, malformed } = readConnections(portRecord);

      if (connections.length === 0) {
        errors.push({
          type: "missing-connection",
          message: `Missing Connection: ${sourceZoneId}:${sourcePortId}`,
          source: { zoneId: sourceZoneId, portId: sourcePortId },
          linkedZoneIds: [sourceZoneId],
        });
        continue;
      }

      if (connections.length > 1 || malformed) {
        errors.push({
          type: "multiple-connections",
          message: `Multiple connections for ${sourceZoneId}:${sourcePortId}`,
          source: { zoneId: sourceZoneId, portId: sourcePortId },
          linkedZoneIds: [sourceZoneId, ...new Set(connections.map((c) => c.zoneId))],
        });
        continue;
      }

      const target = connections[0];
      const targetZone = zonesById[target.zoneId];
      if (!targetZone) {
        errors.push({
          type: "invalid-zone",
          message: `Invalid zone '${target.zoneId}' for ${sourceZoneId}:${sourcePortId} -> ${target.zoneId}:${target.portId}`,
          source: { zoneId: sourceZoneId, portId: sourcePortId },
          target: { zoneId: target.zoneId, portId: target.portId },
          linkedZoneIds: [sourceZoneId],
        });
        continue;
      }

      const targetPort = targetZone.ports?.[target.portId] as Record<string, unknown> | undefined;
      if (!targetPort) {
        errors.push({
          type: "invalid-port",
          message: `Invalid port '${target.zoneId}:${target.portId}' for ${sourceZoneId}:${sourcePortId} -> ${target.zoneId}:${target.portId}`,
          source: { zoneId: sourceZoneId, portId: sourcePortId },
          target: { zoneId: target.zoneId, portId: target.portId },
          linkedZoneIds: [sourceZoneId, target.zoneId],
        });
        continue;
      }

      const targetConnections = readConnections(targetPort).connections;
      const isReciprocal = targetConnections.some(
        (conn) => conn.zoneId === sourceZoneId && conn.portId === sourcePortId,
      );
      if (!isReciprocal) {
        errors.push({
          type: "invalid-connection",
          message: `Invalid Connection: ${target.zoneId}:${target.portId} -> ${sourceZoneId}:${sourcePortId}`,
          source: { zoneId: sourceZoneId, portId: sourcePortId },
          target: { zoneId: target.zoneId, portId: target.portId },
          linkedZoneIds: [sourceZoneId, target.zoneId],
        });
      }
    }
  }

  return { errors };
}
