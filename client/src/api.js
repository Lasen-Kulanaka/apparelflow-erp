// In dev, BASE is "" so requests go through the Vite proxy.
// In production (Phase 7), VITE_API_URL will point to your Render backend.
const BASE = import.meta.env.VITE_API_URL || "";

export const getToken = () => localStorage.getItem("token");
export const setToken = (t) =>
  t ? localStorage.setItem("token", t) : localStorage.removeItem("token");

export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.error || "Request failed");
    err.status = res.status;
    err.details = data?.details; // field-level errors from Zod
    throw err;
  }
  return data;
}