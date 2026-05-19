import { WorldJson, Zone } from "./types";

export type ValidationErrorType =
  | "invalid-zone"
  | "invalid-port"
  | "invalid-connection"
  | "multiple-connections"
  | "missing-connection"
  | "invalid-port-type"
  | "missing-inbound-connection";

export type ValidationError = {
  type: ValidationErrorType;
  message: string;
  source?: { zoneId: string; portId: string };
  target?: { zoneId: string; portId: string };
  linkedZoneIds: string[];
};

export type ValidationResult = { errors: ValidationError[] };

type Connection = { zoneId: string; portId: string };
type PortType = "one-to-one" | "many-to-one";

type PortContext = {
  zoneId: string;
  portId: string;
  portRecord: Record<string, unknown>;
  portType: PortType;
  hasInvalidType: boolean;
};

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

function normalizePortType(value: unknown): { portType: PortType; hasInvalidType: boolean } {
  if (value === undefined || value === null || value === "") {
    return { portType: "one-to-one", hasInvalidType: false };
  }
  if (value === "one-to-one" || value === "many-to-one") {
    return { portType: value, hasInvalidType: false };
  }
  return { portType: "one-to-one", hasInvalidType: true };
}

function zoneMap(world: WorldJson): Record<string, Zone> {
  return Object.fromEntries(world.zones.map((z) => [String(z.id ?? ""), z]).filter(([id]) => id));
}

export function validateWorldJson(world: WorldJson): ValidationResult {
  const zonesById = zoneMap(world);
  const errors: ValidationError[] = [];
  const inboundCounts = new Map<string, number>();
  const portContextById = new Map<string, PortContext>();

  for (const [sourceZoneId, zone] of Object.entries(zonesById)) {
    const ports = zone.ports ?? {};
    for (const [sourcePortId, portData] of Object.entries(ports)) {
      const portRecord = (portData ?? {}) as Record<string, unknown>;
      const { portType, hasInvalidType } = normalizePortType(portRecord.type);
      const key = `${sourceZoneId}:${sourcePortId}`;
      portContextById.set(key, {
        zoneId: sourceZoneId,
        portId: sourcePortId,
        portRecord,
        portType,
        hasInvalidType,
      });
      if (portType === "many-to-one") inboundCounts.set(key, 0);

      if (hasInvalidType) {
        errors.push({
          type: "invalid-port-type",
          message: `Invalid port type '${String(portRecord.type)}' for ${sourceZoneId}:${sourcePortId}`,
          source: { zoneId: sourceZoneId, portId: sourcePortId },
          linkedZoneIds: [sourceZoneId],
        });
      }
    }
  }

  for (const [sourceZoneId, zone] of Object.entries(zonesById)) {
    const ports = zone.ports ?? {};
    for (const [sourcePortId, portData] of Object.entries(ports)) {
      const sourceKey = `${sourceZoneId}:${sourcePortId}`;
      const sourceContext = portContextById.get(sourceKey);
      if (!sourceContext) continue;

      const { connections, malformed } = readConnections(
        (portData ?? {}) as Record<string, unknown>,
      );

      if (connections.length === 0) {
        if (sourceContext.portType === "one-to-one") {
          errors.push({
            type: "missing-connection",
            message: `Missing Connection: ${sourceZoneId}:${sourcePortId}`,
            source: { zoneId: sourceZoneId, portId: sourcePortId },
            linkedZoneIds: [sourceZoneId],
          });
        }
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

      const targetKey = `${target.zoneId}:${target.portId}`;
      const targetContext = portContextById.get(targetKey);
      const targetType = targetContext?.portType ?? "one-to-one";
      if (targetType === "many-to-one") {
        inboundCounts.set(targetKey, (inboundCounts.get(targetKey) ?? 0) + 1);
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

  for (const [key, count] of inboundCounts.entries()) {
    if (count > 0) continue;
    const [zoneId, portId] = key.split(":");
    errors.push({
      type: "missing-inbound-connection",
      message: `Missing Inbound Connection: ${zoneId}:${portId}`,
      source: { zoneId, portId },
      linkedZoneIds: [zoneId],
    });
  }

  return { errors };
}
