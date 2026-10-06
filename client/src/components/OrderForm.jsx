import { useState } from "react";
import { api } from "../api";

const WHOLE = /^\d+$/;
const MONEY = /^\d+(\.\d{1,2})?$/;
const ROLL = /^[A-Za-z0-9-]+$/;

function validate({ recipeId, qty, roll, yards }) {
  const e = {};
  if (!recipeId) e.recipe_id = "Select a recipe";

  const q = qty.trim();
  if (!q) e.target_qty = "Quantity is required";
  else if (!WHOLE.test(q)) e.target_qty = "Whole numbers only (no negatives, decimals or letters)";
  else if (Number(q) <= 0) e.target_qty = "Must be greater than 0";
  else if (Number(q) > 100000) e.target_qty = "Maximum 100,000";

  const r = roll.trim();
  if (!r) e.fabric_roll_id = "Fabric roll ID is required";
  else if (!ROLL.test(r)) e.fabric_roll_id = "Letters, numbers and hyphens only";

  const y = yards.trim();
  if (!y) e.actual_fabric_yds = "Fabric used is required";
  else if (!MONEY.test(y)) e.actual_fabric_yds = "Positive number, max 2 decimals";
  else if (Number(y) <= 0) e.actual_fabric_yds = "Must be greater than 0";

  return e;
}

export default function OrderForm({ recipes, onCreated, onCancel }) {
  const [recipeId, setRecipeId] = useState("");
  const [qty, setQty] = useState("");
  const [roll, setRoll] = useState("");
  const [yards, setYards] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const recipe = recipes.find((r) => String(r.id) === recipeId);
  const qtyValid = WHOLE.test(qty.trim()) && Number(qty) > 0;

  async function handleSubmit(ev) {
    ev.preventDefault();
    const found = validate({ recipeId, qty, roll, yards });
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await api("/api/orders", {
        method: "POST",
        body: {
          recipe_id: Number(recipeId),
          target_qty: Number(qty),
          fabric_roll_id: roll.trim(),
          actual_fabric_yds: Number(yards),
        },
      });
      onCreated();
    } catch (err) {
      if (err.details) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.field || "form", d.message])));
      } else {
        setErrors({ form: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" noValidate onSubmit={handleSubmit} style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>New cutting order</h2>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="recipe">Recipe</label>
          <select id="recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}
            aria-invalid={!!errors.recipe_id}>
            <option value="">Select a recipe…</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>{r.recipe_code}: {r.name}</option>
            ))}
          </select>
          {errors.recipe_id && <p className="error-text">{errors.recipe_id}</p>}
        </div>

        <div className="field">
          <label htmlFor="qty">Target batch quantity (garments)</label>
          <input id="qty" type="text" inputMode="numeric" value={qty} placeholder="e.g. 50"
            onChange={(e) => setQty(e.target.value)} aria-invalid={!!errors.target_qty} />
          {errors.target_qty && <p className="error-text">{errors.target_qty}</p>}
        </div>

        <div className="field">
          <label htmlFor="roll">Fabric roll ID</label>
          <input id="roll" type="text" value={roll} placeholder="e.g. FAB-ROLL-882"
            onChange={(e) => setRoll(e.target.value)} aria-invalid={!!errors.fabric_roll_id} />
          {errors.fabric_roll_id && <p className="error-text">{errors.fabric_roll_id}</p>}
        </div>

        <div className="field">
          <label htmlFor="yards">Actual fabric used (yards)</label>
          <input id="yards" type="text" inputMode="decimal" value={yards} placeholder="e.g. 95.5"
            onChange={(e) => setYards(e.target.value)} aria-invalid={!!errors.actual_fabric_yds} />
          {errors.actual_fabric_yds && <p className="error-text">{errors.actual_fabric_yds}</p>}
        </div>
      </div>

      {recipe && qtyValid && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Expected cut components (preview)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Component</th><th>Per garment</th><th>Expected pieces</th></tr>
              </thead>
              <tbody>
                {recipe.components.map((c) => (
                  <tr key={c.id}>
                    <td>{c.component_name}</td>
                    <td>{c.pieces_per_garment}</td>
                    <td><strong>{c.pieces_per_garment * Number(qty)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Expected fabric: {(recipe.std_fabric_yards * Number(qty)).toFixed(2)} yds
            ({recipe.std_fabric_yards} yds × {qty})
          </p>
        </div>
      )}

      {errors.form && <p className="error-text" role="alert">{errors.form}</p>}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Create order"}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}