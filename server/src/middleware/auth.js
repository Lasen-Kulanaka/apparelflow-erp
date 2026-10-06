import jwt from "jsonwebtoken";
import { query } from "../db/pool.js";

// 1) AUTHENTICATION: who is calling? Rejects with 401 if we can't tell.
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Load the user fresh from the DB. The role comes from here, not the token.
    const { rows } = await query(
      "SELECT id, email, role, full_name FROM users WHERE id = $1",
      [payload.sub]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    req.user = rows[0]; // later code reads the identity from here
    next();
  } catch (err) {
    next(err);
  }
}

// 2) AUTHORIZATION: is this user's role allowed? Rejects with 403 if not.
export const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
  };