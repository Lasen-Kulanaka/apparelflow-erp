import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";

const PASSWORD = "Demo@1234";
const tokens = {};
let blouse; // the Casual Blouse recipe

// ---------- helpers ----------
const auth = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

async function login(email) {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

// Supervisor creates an order (status: CUTTING_IN_PROGRESS)
async function createOrder() {
  const res = await request(app)
    .post("/api/orders")
    .set(auth("supervisor"))
    .send({ recipe_id: blouse.id, target_qty: 10, fabric_roll_id: "TEST-ROLL-1", actual_fabric_yds: 20 });
  expect(res.status).toBe(201);
  return res.body.order.id;
}

// ...then submits it (status: PENDING_VERIFICATION)
async function createPendingOrder() {
  const id = await createOrder();
  const res = await request(app).post(`/api/orders/${id}/submit`).set(auth("supervisor"));
  expect(res.status).toBe(200);
  return id;
}

// Verifier saves counts. pick(item, index) decides each count.
async function saveCounts(id, pick) {
  const queue = await request(app).get("/api/verification/queue").set(auth("verifier"));
  const order = queue.body.orders.find((o) => o.id === id);
  const counts = order.items.map((item, idx) => ({
    component_id: item.component_id,
    actual_qty: pick(item, idx),
  }));
  const res = await request(app)
    .put(`/api/verification/orders/${id}/counts`)
    .set(auth("verifier"))
    .send({ counts });
  expect(res.status).toBe(200);
}

const approve = (id, body = {}) =>
  request(app).post(`/api/verification/orders/${id}/approve`).set(auth("verifier")).send(body);

const reject = (id, body) =>
  request(app).post(`/api/verification/orders/${id}/reject`).set(auth("verifier")).send(body);

const pendingIds = async () => {
  const res = await request(app).get("/api/verification/queue").set(auth("verifier"));
  return res.body.orders.map((o) => o.id);
};

// ---------- setup / teardown ----------
beforeAll(async () => {
  tokens.supervisor = await login("supervisor@apparelflow.demo");
  tokens.verifier = await login("verifier@apparelflow.demo");
  tokens.sewing = await login("sewing@apparelflow.demo");

  const res = await request(app).get("/api/recipes").set(auth("supervisor"));
  blouse = res.body.recipes.find((r) => r.recipe_code === "REC-BL01");
});

afterAll(async () => {
  await pool.end(); // close DB connections so the test process can exit
});

// ---------- TEST 1 ----------
describe("Test 1: all-GREEN order can be approved by a verifier", () => {
  it("approves, sets VERIFIED, and records the verifier from the token", async () => {
    const id = await createPendingOrder();
    await saveCounts(id, (item) => item.expected_qty); // every component exact

    const res = await approve(id);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("VERIFIED");
    expect(res.body.log.decision).toBe("APPROVED");

    const me = await request(app).get("/api/auth/me").set(auth("verifier"));
    expect(res.body.log.verifier_id).toBe(me.body.user.id); // identity came from the JWT
  });

  it("also allows approval when a component is YELLOW (excess)", async () => {
    const id = await createPendingOrder();
    await saveCounts(id, (item, idx) => (idx === 0 ? item.expected_qty + 1 : item.expected_qty));
    const res = await approve(id);
    expect(res.status).toBe(200);
  });
});

// ---------- TEST 2 ----------
describe("Test 2: a RED (shortage) component blocks approval", () => {
  it("returns 422 and leaves the order pending", async () => {
    const id = await createPendingOrder();
    await saveCounts(id, (item, idx) => (idx === 0 ? item.expected_qty - 1 : item.expected_qty));

    const res = await approve(id);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Approval blocked");
    expect(await pendingIds()).toContain(id); // still waiting at QC, not VERIFIED
  });

  it("returns 422 when components were never counted", async () => {
    const id = await createPendingOrder();
    const res = await approve(id);
    expect(res.status).toBe(422);
  });

  it("rejects a smuggled verifier_id in the body", async () => {
    const id = await createPendingOrder();
    await saveCounts(id, (item) => item.expected_qty);
    const res = await approve(id, { verifier_id: 1 });
    expect(res.status).toBe(422);
  });
});

// ---------- TEST 3 ----------
describe("Test 3: rejecting without a reason is refused by the backend", () => {
  it("returns 422 for a missing or blank note, and accepts a real one", async () => {
    const id = await createPendingOrder();

    expect((await reject(id, {})).status).toBe(422);
    expect((await reject(id, { note: "   " })).status).toBe(422);
    expect(await pendingIds()).toContain(id); // nothing changed

    const ok = await reject(id, { note: "Collar pieces have fabric defects" });
    expect(ok.status).toBe(200);
    expect(ok.body.order.status).toBe("REJECTED");
  });
});

// ---------- TEST 4 ----------
describe("Test 4: non-verifier roles get 403 on approval", () => {
  it.each(["supervisor", "sewing"])("%s receives 403 Forbidden", async (role) => {
    const id = await createPendingOrder();
    await saveCounts(id, (item) => item.expected_qty); // even a perfectly valid batch

    const res = await request(app)
      .post(`/api/verification/orders/${id}/approve`)
      .set(auth(role))
      .send({});
    expect(res.status).toBe(403);
    expect(await pendingIds()).toContain(id); // and it did not get approved
  });

  it("returns 401 when there is no token at all", async () => {
    const res = await request(app).post("/api/verification/orders/1/approve").send({});
    expect(res.status).toBe(401);
  });
});

// ---------- TEST 5 ----------
describe("Test 5: unapproved orders never appear in the Sewing Queue", () => {
  it("lists only VERIFIED orders, ignoring any ?status= parameter", async () => {
    const inProgress = await createOrder();          // CUTTING_IN_PROGRESS
    const pending = await createPendingOrder();      // PENDING_VERIFICATION

    const rejected = await createPendingOrder();     // REJECTED
    await reject(rejected, { note: "Shortage in side straps" });

    const verified = await createPendingOrder();     // VERIFIED
    await saveCounts(verified, (item) => item.expected_qty);
    expect((await approve(verified)).status).toBe(200);

    const res = await request(app).get("/api/sewing/queue").set(auth("sewing"));
    expect(res.status).toBe(200);

    const ids = res.body.orders.map((o) => o.id);
    expect(ids).toContain(verified);
    expect(ids).not.toContain(inProgress);
    expect(ids).not.toContain(pending);
    expect(ids).not.toContain(rejected);
    expect(res.body.orders.every((o) => o.status === "VERIFIED")).toBe(true);

    // Trying to manipulate the URL changes nothing
    const tampered = await request(app)
      .get("/api/sewing/queue?status=PENDING_VERIFICATION")
      .set(auth("sewing"));
    expect(tampered.body.orders.map((o) => o.id)).toEqual(ids);
  });

  it("cannot start sewing on an unverified order", async () => {
    const pending = await createPendingOrder();
    const res = await request(app)
      .post(`/api/sewing/orders/${pending}/start`)
      .set(auth("sewing"))
      .send({});
    expect(res.status).toBe(409);
  });
});