import { validateWorldJson } from "./validateWorldJson";
import { WorldJson } from "./types";

function baseWorld(): WorldJson {
  return {
    schemaVersion: 1,
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
  const valid = validateWorldJson(baseWorld());
  expect(valid.errors.length === 0, "valid reciprocal connection should pass");

  const missingZone = baseWorld();
  (missingZone.zones[0].ports as any).NW.connectsTo.zoneId = "missing-zone";
  expect(
    validateWorldJson(missingZone).errors.some((e) => e.type === "invalid-zone"),
    "missing target zone should error",
  );

  const missingPort = baseWorld();
  (missingPort.zones[1].ports as any) = {};
  expect(
    validateWorldJson(missingPort).errors.some((e) => e.type === "invalid-port"),
    "missing target port should error",
  );

  const nonReciprocal = baseWorld();
  (nonReciprocal.zones[1].ports as any).SE.connectsTo.port = "NE";
  expect(
    validateWorldJson(nonReciprocal).errors.some((e) => e.type === "invalid-connection"),
    "non-reciprocal should error",
  );

  const disconnected = baseWorld();
  delete (disconnected.zones[0].ports as any).NW.connectsTo;
  expect(
    validateWorldJson(disconnected).errors.some((e) => e.type === "missing-connection"),
    "disconnected port should error",
  );

  const multipleTargets = baseWorld();
  (multipleTargets.zones[0].ports as any).NW.connectsTo = [
    { zoneId: "roastcorpse-steppe", port: "SE" },
    { zoneId: "roastcorpse-steppe", port: "NE" },
  ];
  expect(
    validateWorldJson(multipleTargets).errors.some((e) => e.type === "multiple-connections"),
    "multiple target connections should error",
  );
})();
