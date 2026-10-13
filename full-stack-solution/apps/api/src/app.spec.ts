import request from "supertest";
import { createApp } from "./app";
import { Router } from "express";

describe("App", () => {
  const app = createApp({ auth: Router(), machines: Router() });

  it("answers the health check", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns a JSON 400 for unknown routes", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const response = await request(app)
      .post("/api/anything")
      .set("Content-Type", "application/json")
      .send("{ broken");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("returns 413 instead of 500 when the body exceeds the limit", async () => {
    const response = await request(app)
      .post("/api/anything")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(200 * 1024) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("accepts a body on the readings path that the default limit would reject", async () => {
    // The ingest parser must be registered before the default one: body-parser
    // skips a request whose body was already consumed, which once made the
    // larger limit dead code and capped batches at the default 100 KB.
    const response = await request(
      createApp({ timeSeries: Router() }),
    )
      .post("/api/monitoring-points/p1/readings")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(300 * 1024) }));

    // Parsed, then no route matched it — the point is that it was not a 413.
    expect(response.status).toBe(404);
  });
});
