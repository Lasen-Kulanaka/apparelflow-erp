import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";

export const sewingRouter = Router();

// STUB: real VERIFIED-only query comes in Phase 6
sewingRouter.get(
  "/queue",
  authenticate,
  requireRole("sewing_supervisor"),
  (req, res) => {
    res.json({ orders: [] });
  }
);