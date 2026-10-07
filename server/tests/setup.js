import fs from "node:fs";
import dotenv from "dotenv";

// Safety rail: tests must NEVER run against your real database.
if (!fs.existsSync(".env.test")) {
  throw new Error("Missing server/.env.test. Tests refuse to run without a test database.");
}
// override: true makes sure .env.test wins over anything else
dotenv.config({ path: ".env.test", override: true });