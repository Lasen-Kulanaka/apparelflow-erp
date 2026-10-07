import { useEffect, useState } from "react";
import { api } from "../api";
import VerifyCard from "../components/VerifyCard";

export default function Verify() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api("/api/verification/queue");
      setOrders(data.orders);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="row-between">
        <h1 style={{ margin: 0 }}>Verification Terminal</h1>
        <button className="secondary" onClick={load}>Refresh</button>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && orders.length === 0 && (
        <div className="card muted">No batches waiting at the QC station.</div>
      )}

      <div className="stack">
        {orders.map((o) => (
          // key includes updated counts so a reloaded card resets its inputs
          <VerifyCard key={o.id} order={o} onDone={load} />
        ))}
      </div>
    </>
  );
}