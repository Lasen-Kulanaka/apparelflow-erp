import { useEffect, useState } from "react";
import { api } from "../api";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "-");

function PieceTable({ items }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Component</th><th>Expected</th><th>Counted</th><th>Variance</th><th>Flag</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.component}>
              <td>{i.component}</td>
              <td>{i.expected}</td>
              <td>{i.actual}</td>
              <td>{i.variance > 0 ? `+${i.variance}` : i.variance}</td>
              <td>
                <span className={`tl ${i.status === "GREEN" ? "green" : "yellow"}`}>
                  {i.status === "GREEN" ? "● MATCH" : "▲ EXCESS"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchCard({ order, onStart, busy }) {
  const started = order.status === "SEWING_STARTED";
  return (
    <section className="card" aria-label={`Order ${order.order_no}`}>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{order.order_no}: {order.recipe_name} ({order.recipe_code})</h2>
        <span className="badge verified">{started ? "Sewing started" : "Verified"}</span>
      </div>
      <p className="muted">
        {order.target_qty} garments · Roll {order.fabric_roll_id} · {order.actual_fabric_yds} yds used
      </p>

      <p>
        <strong>Verified by:</strong> {order.verifier_name} on {fmt(order.verified_at)}
        <br />
        <strong>Fabric wastage:</strong> {order.wastage_pct}% (cap {order.wastage_cap}%)
        {order.wastage_pct > order.wastage_cap && (
          <strong style={{ color: "#7f1d1d" }}> · exceeds cap</strong>
        )}
        {started && <><br /><strong>Sewing started:</strong> {fmt(order.sewing_started_at)}</>}
      </p>

      {order.audit_note && (
        <p>
          <strong>Verifier note:</strong> {order.audit_note}
        </p>
      )}

      <PieceTable items={order.item_snapshot} />

      {!started && (
        <div style={{ marginTop: "1rem" }}>
          <button onClick={() => onStart(order.id)} disabled={busy}>
            {busy ? "Starting…" : "Start Sewing Assembly"}
          </button>
        </div>
      )}
    </section>
  );
}

export default function Sewing() {
  const [queue, setQueue] = useState([]);
  const [started, setStarted] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const [q, s] = await Promise.all([api("/api/sewing/queue"), api("/api/sewing/started")]);
      setQueue(q.orders);
      setStarted(s.orders);
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

  async function start(id) {
    setBusyId(id);
    try {
      await api(`/api/sewing/orders/${id}/start`, { method: "POST", body: {} });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="row-between">
        <h1 style={{ margin: 0 }}>Sewing Queue</h1>
        <button className="secondary" onClick={load}>Refresh</button>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && queue.length === 0 && (
        <div className="card muted">No verified batches waiting for sewing.</div>
      )}

      <div className="stack">
        {queue.map((o) => (
          <BatchCard key={o.id} order={o} onStart={start} busy={busyId === o.id} />
        ))}
      </div>

      {started.length > 0 && (
        <>
          <h2 style={{ marginTop: "2rem" }}>In assembly</h2>
          <div className="stack">
            {started.map((o) => <BatchCard key={o.id} order={o} />)}
          </div>
        </>
      )}
    </>
  );
}