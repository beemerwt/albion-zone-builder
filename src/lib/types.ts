export type Point = [number, number];
export type CornerName = 'Top' | 'Right' | 'Bottom' | 'Left';
export type PortsMap = Record<string, { x: number; y: number; connectsTo: { zoneId: string; port: string } }>;
export type Zone = { id?: string; name?: string; ports?: PortsMap } & Record<string, unknown>;
export type WorldJson = { zones: Zone[] } & Record<string, unknown>;
