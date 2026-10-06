import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query } from "../db/pool.js";
import { authenticate } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    }
    const { email, password } = parsed.data;

    const { rows } = await query(
      "SELECT id, email, password_hash, role, full_name FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    const user = rows[0];

    // Same message for "no such email" and "wrong password", so attackers
    // can't discover which emails exist.
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({}, process.env.JWT_SECRET, {
      subject: String(user.id), // the token carries ONLY the user id
      expiresIn: "8h",
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    });
  } catch (err) {
    next(err);
  }
});

// Lets the frontend ask "who am I?" after a page refresh
authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});