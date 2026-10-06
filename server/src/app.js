import express from "express";
import cors from "cors";
import { query } from "./db/pool.js";
import { authRouter } from "./routes/auth.js";
import { sewingRouter } from "./routes/sewing.js";

export const app = express();

app.use(cors());
app.use(express.json()); // lets us read JSON request bodies
app.use("/api/auth", authRouter);
app.use("/api/sewing", sewingRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const result = await query("SELECT NOW() AS now");
    res.json({ status: "ok", dbTime: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});