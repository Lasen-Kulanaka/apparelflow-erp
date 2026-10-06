import { Router } from "express";
import { query } from "../db/pool.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const recipesRouter = Router();

recipesRouter.get(
  "/",
  authenticate,
  requireRole("cutting_supervisor", "cutting_verifier"),
  async (req, res, next) => {
    try {
      const { rows } = await query(`
        SELECT r.id, r.recipe_code, r.name, r.category,
               r.std_fabric_yards::float AS std_fabric_yards,
               r.wastage_cap::float AS wastage_cap,
               COALESCE(
                 json_agg(json_build_object(
                   'id', c.id,
                   'component_name', c.component_name,
                   'pieces_per_garment', c.pieces_per_garment
                 ) ORDER BY c.id) FILTER (WHERE c.id IS NOT NULL),
                 '[]'
               ) AS components
        FROM recipes r
        LEFT JOIN recipe_components c ON c.recipe_id = r.id
        GROUP BY r.id
        ORDER BY r.id`);
      res.json({ recipes: rows });
    } catch (err) {
      next(err);
    }
  }
);