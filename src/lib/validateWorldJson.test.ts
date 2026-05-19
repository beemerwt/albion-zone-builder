import { validateWorldJson } from "./validateWorldJson";
import { WorldJson } from "./types";

function baseWorld(version = 1): WorldJson {
  return {
    schemaVersion: version,
    zones: [
      {
        id: "deadvein-gully",
        ports: { NW: { x: 0, y: 0, connectsTo: { zoneId: "roastcorpse-steppe", port: "SE" } } },
      },
      {
        id: "roastcorpse-steppe",
        ports: { SE: { x: 0, y: 0, connectsTo: { zoneId: "deadvein-gully", port: "NW" } } },
      },
    ],
  };
}

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

(function runHarness() {
  expect(validateWorldJson(baseWorld(1)).errors.length === 0, "v1 no-type reciprocal should pass");

  const nonReciprocal = baseWorld(2);
  (nonReciprocal.zones[1].ports as any).SE.connectsTo.port = "NE";
  expect(
    validateWorldJson(nonReciprocal).errors.some((e) => e.type === "invalid-connection"),
    "one-to-one non-reciprocal should error",
  );

  const manyToOneValid: WorldJson = {
    schemaVersion: 2,
    zones: [
      {
        id: "deadvein-gully",
        ports: { NW: { x: 0, y: 0, connectsTo: { zoneId: "road-hub", port: "MTO" } } },
      },
      {
        id: "roastcorpse-steppe",
        ports: { SE: { x: 0, y: 0, connectsTo: { zoneId: "road-hub", port: "MTO" } } },
      },
      { id: "road-hub", ports: { MTO: { x: 0, y: 0, type: "many-to-one" } } },
    ],
  };
  expect(
    validateWorldJson(manyToOneValid).errors.length === 0,
    "many-to-one with inbound should pass",
  );

  const manyToOneNoInbound: WorldJson = {
    schemaVersion: 2,
    zones: [{ id: "road-hub", ports: { MTO: { x: 0, y: 0, type: "many-to-one" } } }],
  };
  expect(
    validateWorldJson(manyToOneNoInbound).errors.some(
      (e) =>
        e.type === "missing-inbound-connection" &&
        e.message === "Missing Inbound Connection: road-hub:MTO",
    ),
    "many-to-one with no inbound should error",
  );

  const manyToOneOutgoingValid: WorldJson = {
    schemaVersion: 2,
    zones: [
      {
        id: "deadvein-gully",
        ports: { NW: { x: 0, y: 0, connectsTo: { zoneId: "road-hub", port: "MTO" } } },
      },
      {
        id: "road-hub",
        ports: {
          MTO: {
            x: 0,
            y: 0,
            type: "many-to-one",
            connectsTo: { zoneId: "next-zone", port: "SW" },
          },
        },
      },
      {
        id: "next-zone",
        ports: { SW: { x: 0, y: 0, connectsTo: { zoneId: "road-hub", port: "MTO" } } },
      },
    ],
  };
  expect(
    validateWorldJson(manyToOneOutgoingValid).errors.length === 0,
    "many-to-one outgoing reciprocal should pass",
  );

  const manyToOneOutgoingInvalid: WorldJson = JSON.parse(JSON.stringify(manyToOneOutgoingValid));
  (manyToOneOutgoingInvalid.zones[2].ports as any).SW.connectsTo = {
    zoneId: "deadvein-gully",
    port: "NW",
  };
  expect(
    validateWorldJson(manyToOneOutgoingInvalid).errors.some(
      (e) =>
        e.type === "invalid-connection" &&
        e.message === "Invalid Connection: next-zone:SW -> road-hub:MTO",
    ),
    "many-to-one outgoing non-reciprocal should error",
  );

  const invalidType = baseWorld(2);
  (invalidType.zones[0].ports as any).NW.type = "bad-type";
  expect(
    validateWorldJson(invalidType).errors.some(
      (e) =>
        e.type === "invalid-port-type" &&
        e.message === "Invalid port type 'bad-type' for deadvein-gully:NW",
    ),
    "invalid type should error",
  );
})();
