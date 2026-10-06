import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db/pool.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export const ordersRouter = Router();

// No z.coerce here on purpose: the string "50" or the value 5.5 must be REJECTED, not silently converted.
const createOrderSchema = z
  .object({
    recipe_id: z.number().int().positive(),
    target_qty: z
      .number()
      .int("Must be a whole number")
      .positive("Must be greater than 0")
      .max(100000, "Maximum 100,000"),
    fabric_roll_id: z
      .string()
      .trim()
      .min(1, "Fabric roll ID is required")
      .max(40, "Too long")
      .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only"),
    actual_fabric_yds: z
      .number()
      .positive("Must be greater than 0")
      .max(1000000, "Too large")
      .refine((v) => Math.round(v * 100) / 100 === v, "Maximum 2 decimal places"),
  })
  .strict(); // unknown keys (like "status" or "created_by") are rejected

// CREATE an order (supervisor only)
ordersRouter.post(
  "/",
  authenticate,
  requireRole("cutting_supervisor"),
  validate(createOrderSchema),
  async (req, res, next) => {
    const { recipe_id, target_qty, fabric_roll_id, actual_fabric_yds } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const recipe = await client.query("SELECT id FROM recipes WHERE id = $1", [recipe_id]);
      if (recipe.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Recipe not found" });
      }

      // created_by comes from the verified token (req.user), never from the body
      const order = await client.query(
        `INSERT INTO cutting_orders
           (order_no, recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by)
         VALUES ('CUT-' || nextval('order_no_seq'), $1, $2, $3, $4, $5)
         RETURNING id, order_no, status`,
        [recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, req.user.id]
      );
      const orderId = order.rows[0].id;

      // THE MULTIPLIER ENGINE: one expected-count row per component
      await client.query(
        `INSERT INTO verification_items (order_id, component_id, expected_qty)
         SELECT $1::int, id, pieces_per_garment * $2::int
         FROM recipe_components WHERE recipe_id = $3`,
        [orderId, target_qty, recipe_id]
      );

      await client.query("COMMIT");
      res.status(201).json({ order: order.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  }
);

// LIST my orders (supervisor only)
ordersRouter.get(
  "/",
  authenticate,
  requireRole("cutting_supervisor"),
  async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT o.id, o.order_no, o.status, o.target_qty, o.fabric_roll_id,
                o.actual_fabric_yds::float AS actual_fabric_yds, o.created_at,
                r.name AS recipe_name, r.recipe_code,
                (SELECT l.rejection_note FROM verification_logs l
                  WHERE l.order_id = o.id AND l.decision = 'REJECTED'
                  ORDER BY l.timestamp DESC LIMIT 1) AS last_rejection_note
         FROM cutting_orders o
         JOIN recipes r ON r.id = o.recipe_id
         WHERE o.created_by = $1
         ORDER BY o.created_at DESC`,
        [req.user.id]
      );
      res.json({ orders: rows });
    } catch (err) {
      next(err);
    }
  }
);

// SUBMIT for verification (supervisor only)
ordersRouter.post(
  "/:id/submit",
  authenticate,
  requireRole("cutting_supervisor"),
  async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(422).json({ error: "Invalid order id" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // The WHERE clause IS the state machine rule: only these states may move forward
      const { rows } = await client.query(
        `UPDATE cutting_orders
            SET status = 'PENDING_VERIFICATION', updated_at = NOW()
          WHERE id = $1 AND created_by = $2
            AND status IN ('CUTTING_IN_PROGRESS', 'REJECTED')
        RETURNING id, order_no, status`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Order not found or not in a submittable state" });
      }

      // A resubmitted (previously rejected) order must be recounted from scratch
      await client.query(
        "UPDATE verification_items SET actual_qty = NULL, status = NULL WHERE order_id = $1",
        [id]
      );

      await client.query("COMMIT");
      res.json({ order: rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  }
);