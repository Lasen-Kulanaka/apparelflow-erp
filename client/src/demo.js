export const DEMO_PASSWORD = "Demo@1234";

export const DEMO_USERS = [
  { email: "supervisor@apparelflow.demo", label: "Cutting Supervisor", role: "cutting_supervisor" },
  { email: "verifier@apparelflow.demo", label: "Cutting Verifier", role: "cutting_verifier" },
  { email: "sewing@apparelflow.demo", label: "Sewing Supervisor", role: "sewing_supervisor" },
];

// Which page each role lands on, and which links it sees
export const HOME_BY_ROLE = {
  cutting_supervisor: "/orders",
  cutting_verifier: "/verify",
  sewing_supervisor: "/sewing",
};

export const NAV_BY_ROLE = {
  cutting_supervisor: [{ to: "/orders", label: "Cutting Orders" }],
  cutting_verifier: [{ to: "/verify", label: "Verification Terminal" }],
  sewing_supervisor: [{ to: "/sewing", label: "Sewing Queue" }],
};