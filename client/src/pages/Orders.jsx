import { useEffect, useState } from "react";
import { api } from "../api";
import OrderForm from "../components/OrderForm";

const STATUS = {
  CUTTING_IN_PROGRESS: { label: "Cutting in progress", cls: "progress" },
  PENDING_VERIFICATION: { label: "Pending verification", cls: "pending" },
  REJECTED: { label: "Rejected", cls: "rejected" },
  VERIFIED: { label: "Verified", cls: "verified" },
  SEWING_STARTED: { label: "Sewing started", cls: "verified" },
};

export default function Orders() {
  const [recipes, setRecipes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const [r, o] = await Promise.all([api("/api/recipes"), api("/api/orders")]);
      setRecipes(r.recipes);
      setOrders(o.orders);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submitOrder(id) {
    try {
      await api(`/api/orders/${id}/submit`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="row-between">
        <h1 style={{ margin: 0 }}>Cutting Orders</h1>
        {!showForm && <button onClick={() => setShowForm(true)}>+ New order</button>}
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      {showForm && (
        <OrderForm
          recipes={recipes}
          onCancel={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load(); }}
        />
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th><th>Recipe</th><th>Qty</th><th>Roll</th><th>Fabric (yds)</th>
              <th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan="7" className="muted">No orders yet. Create your first one.</td></tr>
            )}
            {orders.map((o) => {
              const s = STATUS[o.status];
              const canSubmit = o.status === "CUTTING_IN_PROGRESS" || o.status === "REJECTED";
              return (
                <tr key={o.id}>
                  <td><strong>{o.order_no}</strong></td>
                  <td>{o.recipe_name}</td>
                  <td>{o.target_qty}</td>
                  <td>{o.fabric_roll_id}</td>
                  <td>{o.actual_fabric_yds}</td>
                  <td>
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                    {o.status === "REJECTED" && o.last_rejection_note && (
                      <p className="error-text">Reason: {o.last_rejection_note}</p>
                    )}
                  </td>
                  <td>
                    {canSubmit && (
                      <button onClick={() => submitOrder(o.id)}>
                        {o.status === "REJECTED" ? "Resubmit" : "Submit for verification"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}