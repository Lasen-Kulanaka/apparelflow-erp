import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

const DEMO_PASSWORD = "Demo@1234";

const users = [
  { email: "supervisor@apparelflow.demo", full_name: "Nimal Perera", role: "cutting_supervisor" },
  { email: "verifier@apparelflow.demo",   full_name: "Kasun Fernando",  role: "cutting_verifier" },
  { email: "sewing@apparelflow.demo",     full_name: "Dilini Jayasinghe",    role: "sewing_supervisor" },
];

const recipes = [
  {
    recipe_code: "REC-BL01",
    name: "Casual Blouse",
    category: "Blouse",
    std_fabric_yards: 1.8,
    wastage_cap: 5.0,
    components: [
      ["Front Body Panel", 1],
      ["Back Body Panel", 1],
      ["Sleeves (Left & Right)", 2],
      ["Collar & Stand", 1],
      ["Sleeve Cuffs", 2],
    ],
  },
  {
    recipe_code: "REC-CT02",
    name: "Crop Top",
    category: "Crop Top",
    std_fabric_yards: 1.1,
    wastage_cap: 8.0,
    components: [
      ["Front Chest Panel", 1],
      ["Back Support Panel", 1],
      ["Neck Binding Strip", 1],
      ["Hem Elastic Casing", 1],
      ["Side Strap Accents", 2],
    ],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Hash once, reuse for all three demo users
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    for (const u of users) {
      // ON CONFLICT makes the seed safe to rerun: it updates instead of duplicating
      await client.query(
        `INSERT INTO users (email, password_hash, role, full_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               role = EXCLUDED.role,
               full_name = EXCLUDED.full_name`,
        [u.email, passwordHash, u.role, u.full_name]
      );
    }

    for (const r of recipes) {
      const { rows } = await client.query(
        `INSERT INTO recipes (recipe_code, name, category, std_fabric_yards, wastage_cap)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (recipe_code) DO UPDATE
           SET name = EXCLUDED.name,
               category = EXCLUDED.category,
               std_fabric_yards = EXCLUDED.std_fabric_yards,
               wastage_cap = EXCLUDED.wastage_cap
         RETURNING id`,
        [r.recipe_code, r.name, r.category, r.std_fabric_yards, r.wastage_cap]
      );
      const recipeId = rows[0].id;

      // Components have no natural unique key, so clear and re-insert.
      // Safe now because no orders reference them yet.
      await client.query("DELETE FROM recipe_components WHERE recipe_id = $1", [recipeId]);
      for (const [name, pieces] of r.components) {
        await client.query(
          `INSERT INTO recipe_components (recipe_id, component_name, pieces_per_garment)
           VALUES ($1, $2, $3)`,
          [recipeId, name, pieces]
        );
      }
    }

    await client.query("COMMIT");
    console.log("Seed complete: 3 users, 2 recipes, 10 components");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();