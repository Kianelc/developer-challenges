import {
  assignSensorSchema,
  getAllowedSensorModels,
  isSensorModelAllowed,
} from "./sensor";

describe("isSensorModelAllowed", () => {
  it.each(["TcAg", "TcAs"] as const)("rejects %s on a Pump", (model) => {
    expect(isSensorModelAllowed("Pump", model)).toBe(false);
  });

  it("accepts HF+ on a Pump", () => {
    expect(isSensorModelAllowed("Pump", "HF+")).toBe(true);
  });

  it.each(["TcAg", "TcAs", "HF+"] as const)("accepts %s on a Fan", (model) => {
    expect(isSensorModelAllowed("Fan", model)).toBe(true);
  });
});

describe("getAllowedSensorModels", () => {
  it("returns only HF+ for a Pump", () => {
    expect(getAllowedSensorModels("Pump")).toEqual(["HF+"]);
  });

  it("returns evey model for a Fan", () => {
    expect(getAllowedSensorModels("Fan")).toEqual(["TcAg", "TcAs", "HF+"]);
  });
});

describe("assignSensorSchema", () => {
  it("accepts a valid sensor", () => {
    expect(
      assignSensorSchema.safeParse({ id: "S-001", model: "HF+" }).success,
    ).toBe(true);
  });
  it("rejects an unkown model", () => {
    expect(
      assignSensorSchema.safeParse({ id: "S-001", model: "XYZ" }).success,
    ).toBe(false);
  });
  it("rejects a blank id", () => {
    expect(
      assignSensorSchema.safeParse({ id: "  ", model: "TcAg" }).success,
    ).toBe(false);
  });
});
