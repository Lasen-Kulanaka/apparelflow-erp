import { Router } from "express";
import { query } from "../db/pool.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";

export const sewingRouter = Router();

// One guard for the whole file, same pattern as verification.js
sewingRouter.use(authenticate, requireRole("sewing_supervisor"));

// Shared SELECT. The status is passed in by OUR code, never by the request.
const baseSelect = `
  SELECT o.id, o.order_no, o.status, o.target_qty, o.fabric_roll_id,
         o.actual_fabric_yds::float AS actual_fabric_yds,
         o.sewing_started_at,
         r.name AS recipe_name, r.recipe_code,
         r.wastage_cap::float AS wastage_cap,
         l.verifier_id, u.full_name AS verifier_name,
         l.timestamp AS verified_at,
         l.wastage_pct::float AS wastage_pct,
         l.item_snapshot
    FROM cutting_orders o
    JOIN recipes r ON r.id = o.recipe_id
    JOIN LATERAL (
      SELECT * FROM verification_logs
       WHERE order_id = o.id AND decision = 'APPROVED'
       ORDER BY timestamp DESC LIMIT 1
    ) l ON TRUE
    JOIN users u ON u.id = l.verifier_id`;

// THE QUEUE: only VERIFIED orders. Hard-coded in SQL, no URL params used.
sewingRouter.get("/queue", async (req, res, next) => {
  try {
    const { rows } = await query(
      `${baseSelect} WHERE o.status = 'VERIFIED' ORDER BY l.timestamp ASC`
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
});

// Batches already released to assembly (separate endpoint, also status-locked)
sewingRouter.get("/started", async (req, res, next) => {
  try {
    const { rows } = await query(
      `${baseSelect} WHERE o.status = 'SEWING_STARTED' ORDER BY o.sewing_started_at DESC`
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
});

// START SEWING: takes no body fields
sewingRouter.post("/orders/:id/start", validate(z.object({}).strict()), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(422).json({ error: "Invalid order id" });
    }

    // Atomic: only a VERIFIED order can move. Who/when come from the server.
    const { rows } = await query(
      `UPDATE cutting_orders
          SET status = 'SEWING_STARTED',
              sewing_started_by = $2,
              sewing_started_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status = 'VERIFIED'
        RETURNING id, order_no, status, sewing_started_at`,
      [id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: "Order not found or not verified" });
    }
    res.json({ order: rows[0] });
  } catch (err) {
    next(err);
  }
});