type Level = "info" | "warn" | "error";

// One JSON object per line on stdout (stderr for errors). The kubelet writes
// that to the pod log, Alloy ships it to Loki, and `| json` can parse it.
// LOG_LEVEL=silent turns it off (used by the Jest setup).
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (process.env.LOG_LEVEL === "silent") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
