import request from "supertest";
import { createApp } from "./app";

describe("App", () => {
  const app = createApp();

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
});
