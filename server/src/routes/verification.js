import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db/pool.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { computeStatus, approvalBlocker, wastagePct } from "../domain/verification.js";

export const verificationRouter = Router();

// ONE guard for every route in this file: impossible to forget on a new endpoint.
verificationRouter.use(authenticate, requireRole("cutting_verifier"));

const validId = (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(422).json({ error: "Invalid order id" });
  }
  req.orderId = id;
  next();
};

// ---------- schemas ----------
const countsSchema = z
  .object({
    counts: z
      .array(
        z
          .object({
            component_id: z.number().int().positive(),
            actual_qty: z
              .number()
              .int("Must be a whole number")
              .min(0, "Cannot be negative")
              .max(1000000, "Too large"),
          })
          .strict()
      )
      .min(1, "At least one count is required")
      .refine(
        (arr) => new Set(arr.map((c) => c.component_id)).size === arr.length,
        "Duplicate component in counts"
      ),
  })
  .strict();

// Approve takes NO body fields. If a client sends verifier_id or wastage_pct, it's rejected.
const approveSchema = z.object({}).strict();

const rejectSchema = z
  .object({
    note: z
      .string({ required_error: "A rejection reason is required" })
      .trim()
      .min(1, "A rejection reason is required")
      .max(500, "Maximum 500 characters"),
  })
  .strict();

// ---------- helpers ----------
// Locks the order row until COMMIT/ROLLBACK, so no one else can change it meanwhile.
async function lockOrder(client, id) {
  const { rows } = await client.query(
    `SELECT o.id, o.status, o.target_qty,
            o.actual_fabric_yds::float AS actual_fabric_yds,
            r.std_fabric_yards::float AS std_fabric_yards
       FROM cutting_orders o
       JOIN recipes r ON r.id = o.recipe_id
      WHERE o.id = $1
        FOR UPDATE OF o`,
    [id]
  );
  return rows[0];
}

async function loadItems(client, orderId) {
  const { rows } = await client.query(
    `SELECT vi.component_id, c.component_name, vi.expected_qty, vi.actual_qty, vi.status
       FROM verification_items vi
       JOIN recipe_components c ON c.id = vi.component_id
      WHERE vi.order_id = $1
      ORDER BY c.id`,
    [orderId]
  );
  return rows;
}

const snapshotOf = (items) =>
  items.map((i) => ({
    component: i.component_name,
    expected: i.expected_qty,
    actual: i.actual_qty,
    variance: i.actual_qty === null ? null : i.actual_qty - i.expected_qty,
    status: i.status,
  }));

// ---------- routes ----------

// The verifier's work queue: only orders waiting at the QC station
verificationRouter.get("/queue", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.id, o.order_no, o.status, o.target_qty, o.fabric_roll_id,
              o.actual_fabric_yds::float AS actual_fabric_yds,
              r.name AS recipe_name, r.recipe_code,
              r.std_fabric_yards::float AS std_fabric_yards,
              r.wastage_cap::float AS wastage_cap,
              u.full_name AS supervisor_name,
              json_agg(json_build_object(
                'component_id', c.id,
                'component_name', c.component_name,
                'expected_qty', vi.expected_qty,
                'actual_qty', vi.actual_qty,
                'status', vi.status
              ) ORDER BY c.id) AS items
         FROM cutting_orders o
         JOIN recipes r ON r.id = o.recipe_id
         JOIN users u ON u.id = o.created_by
         JOIN verification_items vi ON vi.order_id = o.id
         JOIN recipe_components c ON c.id = vi.component_id
        WHERE o.status = 'PENDING_VERIFICATION'
        GROUP BY o.id, r.id, u.id
        ORDER BY o.updated_at ASC`
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
});

// Save the physical counts. The SERVER computes GREEN / YELLOW / RED.
verificationRouter.put("/orders/:id/counts", validId, validate(countsSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const order = await lockOrder(client, req.orderId);
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status !== "PENDING_VERIFICATION") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `Order is ${order.status}, counts cannot be changed` });
    }

    for (const { component_id, actual_qty } of req.body.counts) {
      const found = await client.query(
        "SELECT expected_qty FROM verification_items WHERE order_id = $1 AND component_id = $2",
        [req.orderId, component_id]
      );
      if (found.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          error: "Validation failed",
          details: [{ field: "counts", message: `Component ${component_id} is not part of this order` }],
        });
      }
      const status = computeStatus(found.rows[0].expected_qty, actual_qty);
      await client.query(
        `UPDATE verification_items SET actual_qty = $3, status = $4
          WHERE order_id = $1 AND component_id = $2`,
        [req.orderId, component_id, actual_qty, status]
      );
    }

    const items = await loadItems(client, req.orderId);
    await client.query("COMMIT");
    res.json({ items });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// APPROVE: the hard stop
verificationRouter.post("/orders/:id/approve", validId, validate(approveSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const order = await lockOrder(client, req.orderId);
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status !== "PENDING_VERIFICATION") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `Order is ${order.status}, it cannot be approved` });
    }

    // THE HARD STOP: any RED or uncounted component → 422, nothing is written
    const items = await loadItems(client, req.orderId);
    const blocker = approvalBlocker(items);
    if (blocker) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Approval blocked", reason: blocker });
    }

    const pct = wastagePct(order.actual_fabric_yds, order.std_fabric_yards, order.target_qty);

    await client.query(
      "UPDATE cutting_orders SET status = 'VERIFIED', updated_at = NOW() WHERE id = $1",
      [req.orderId]
    );
    // verifier_id comes from the verified token. The timestamp is the DB clock.
    const log = await client.query(
      `INSERT INTO verification_logs (order_id, verifier_id, decision, wastage_pct, item_snapshot)
       VALUES ($1, $2, 'APPROVED', $3, $4::jsonb)
       RETURNING id, verifier_id, decision, wastage_pct::float AS wastage_pct, timestamp`,
      [req.orderId, req.user.id, pct, JSON.stringify(snapshotOf(items))]
    );

    await client.query("COMMIT");
    res.json({ order: { id: order.id, status: "VERIFIED" }, log: log.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// REJECT: mandatory reason, returns the batch to the supervisor
verificationRouter.post("/orders/:id/reject", validId, validate(rejectSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const order = await lockOrder(client, req.orderId);
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status !== "PENDING_VERIFICATION") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `Order is ${order.status}, it cannot be rejected` });
    }

    const items = await loadItems(client, req.orderId);
    const pct = wastagePct(order.actual_fabric_yds, order.std_fabric_yards, order.target_qty);

    await client.query(
      "UPDATE cutting_orders SET status = 'REJECTED', updated_at = NOW() WHERE id = $1",
      [req.orderId]
    );
    const log = await client.query(
      `INSERT INTO verification_logs
         (order_id, verifier_id, decision, rejection_note, wastage_pct, item_snapshot)
       VALUES ($1, $2, 'REJECTED', $3, $4, $5::jsonb)
       RETURNING id, verifier_id, decision, rejection_note, timestamp`,
      [req.orderId, req.user.id, req.body.note, pct, JSON.stringify(snapshotOf(items))]
    );

    await client.query("COMMIT");
    res.json({ order: { id: order.id, status: "REJECTED" }, log: log.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});