import { useState } from "react";
import { api } from "../api";

const WHOLE = /^\d+$/;

// Live preview of the traffic light. The SERVER recomputes this independently.
function flag(expected, raw) {
  const t = raw.trim();
  if (t === "") return { key: "EMPTY", label: "Not counted" };
  if (!WHOLE.test(t)) return { key: "INVALID", label: "Whole numbers only" };
  const n = Number(t);
  if (n === expected) return { key: "GREEN", label: "● MATCH" };
  if (n > expected) return { key: "YELLOW", label: `▲ EXCESS (+${n - expected})` };
  return { key: "RED", label: `■ SHORTAGE (−${expected - n})` };
}

const CLASS = { GREEN: "green", YELLOW: "yellow", RED: "red", EMPTY: "empty", INVALID: "red" };

export default function VerifyCard({ order, onDone }) {
  // One text value per component, keyed by component_id
  const [inputs, setInputs] = useState(() =>
    Object.fromEntries(order.items.map((i) => [i.component_id, i.actual_qty === null ? "" : String(i.actual_qty)]))
  );
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  const flags = order.items.map((i) => ({ item: i, f: flag(i.expected_qty, inputs[i.component_id]) }));
  const hasRed = flags.some(({ f }) => f.key === "RED");
  const hasBlank = flags.some(({ f }) => f.key === "EMPTY" || f.key === "INVALID");
  const canApprove = !hasRed && !hasBlank && !busy;

  const expectedFabric = order.std_fabric_yards * order.target_qty;
  const wastage = Math.round(((order.actual_fabric_yds - expectedFabric) / expectedFabric) * 10000) / 100;
  const overCap = wastage > order.wastage_cap;

  // Only send counts that are valid whole numbers
  function validCounts() {
    return flags
      .filter(({ f }) => ["GREEN", "YELLOW", "RED"].includes(f.key))
      .map(({ item }) => ({ component_id: item.component_id, actual_qty: Number(inputs[item.component_id]) }));
  }

  async function saveCounts() {
    const counts = validCounts();
    if (counts.length === 0) return;
    await api(`/api/verification/orders/${order.id}/counts`, { method: "PUT", body: { counts } });
  }

  function showError(err) {
    setServerError(err.reason ? `${err.message}: ${err.reason}` : err.message);
  }

  async function save() {
    setServerError("");
    setSaved("");
    if (validCounts().length === 0) {
      setServerError("Enter at least one valid whole-number count first");
      return;
    }
    setBusy(true);
    try {
      await saveCounts();
      setSaved("Counts saved");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setServerError("");
    try {
      await saveCounts();
      await api(`/api/verification/orders/${order.id}/approve`, { method: "POST", body: {} });
      onDone();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!note.trim()) {
      setNoteError("A rejection reason is required");
      return;
    }
    setNoteError("");
    setBusy(true);
    setServerError("");
    try {
      await saveCounts(); // record whatever was counted, so the audit snapshot is accurate
      await api(`/api/verification/orders/${order.id}/reject`, { method: "POST", body: { note: note.trim() } });
      onDone();
    } catch (err) {
      if (err.details) setNoteError(err.details.map((d) => d.message).join(", "));
      else showError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label={`Order ${order.order_no}`}>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{order.order_no}: {order.recipe_name} ({order.recipe_code})</h2>
        <span className="badge pending">Pending verification</span>
      </div>
      <p className="muted">
        {order.target_qty} garments · Roll {order.fabric_roll_id} · Submitted by {order.supervisor_name}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Component</th><th>Expected</th><th>Actual count</th><th>Status</th></tr>
          </thead>
          <tbody>
            {flags.map(({ item, f }) => (
              <tr key={item.component_id}>
                <td>{item.component_name}</td>
                <td><strong>{item.expected_qty}</strong></td>
                <td>
                  <input
                    className="count-input"
                    type="text"
                    inputMode="numeric"
                    aria-label={`Actual count for ${item.component_name}`}
                    aria-invalid={f.key === "INVALID"}
                    value={inputs[item.component_id]}
                    onChange={(e) => {
                      setInputs({ ...inputs, [item.component_id]: e.target.value });
                      setSaved("");
                    }}
                  />
                </td>
                <td><span className={`tl ${CLASS[f.key]}`}>{f.label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: "0.75rem" }}>
        Fabric: expected {expectedFabric.toFixed(2)} yds, used {order.actual_fabric_yds} yds →
        wastage <strong>{wastage}%</strong> (cap {order.wastage_cap}%)
        {overCap && <strong style={{ color: "#7f1d1d" }}> · exceeds cap</strong>}
      </p>

      {hasRed && (
        <div className="alert-box" role="alert">
          Shortage detected. Approval is blocked. Reject this batch with a reason so it can be re-cut.
        </div>
      )}
      {!hasRed && hasBlank && (
        <p className="muted">Enter a valid count for every component to enable approval.</p>
      )}

      <div className="field" style={{ marginTop: "1rem" }}>
        <label htmlFor={`note-${order.id}`}>Rejection reason (required to reject)</label>
        <textarea
          id={`note-${order.id}`}
          rows={2}
          value={note}
          maxLength={500}
          placeholder="e.g. Collar pieces have fabric defects"
          aria-invalid={!!noteError}
          onChange={(e) => setNote(e.target.value)}
        />
        {noteError && <p className="error-text">{noteError}</p>}
      </div>

      {serverError && <p className="error-text" role="alert">{serverError}</p>}
      {saved && <p className="muted" role="status"><strong>{saved}</strong></p>}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button className="secondary" onClick={save} disabled={busy}>
          Save counts
        </button>
        <button onClick={approve} disabled={!canApprove}>
          {busy ? "Working…" : "Approve Batch"}
        </button>
        <button className="secondary" style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
          onClick={reject} disabled={busy}>
          Reject Batch
        </button>
      </div>
    </section>
  );
}