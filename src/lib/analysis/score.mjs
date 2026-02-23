export function diffSignals(prev, curr) {
  const changes = [];

  const prevG = (prev?.extracted?.guidance ?? []).length;
  const currG = (curr?.guidance ?? []).length;
  if (currG !== prevG) changes.push({ type: "guidance_count", delta: currG - prevG, severity: Math.min(1, Math.abs(currG - prevG) / 5) });

  const prevRisks = (prev?.extracted?.notableRisks ?? []).length;
  const currRisks = (curr?.notableRisks ?? []).length;
  if (currRisks > prevRisks) changes.push({ type: "risk_added", delta: currRisks - prevRisks, severity: 0.7 });

  return changes;
}

export function scoreSignal({ extracted, changeLog }) {
  // MVP heuristic: confidence up if guidance exists and evidence is present; risk up if notable risks added.
  const guidance = extracted?.guidance ?? [];
  const drivers = extracted?.forwardDrivers ?? [];
  const risks = extracted?.notableRisks ?? [];

  const confidence =
    clamp(50 + guidance.length * 4 + drivers.length * 2 - risks.length * 3, 0, 100);

  const risk =
    clamp(20 + risks.reduce((s, r) => s + (r.severity ?? 0.5) * 15, 0) + changeLog.some(c => c.type === "risk_added") * 10, 0, 100);

  const trajectory =
    clamp(drivers.filter(d => d.direction === "up").length * 5 - drivers.filter(d => d.direction === "down").length * 5, -50, 50);

  const overall =
    clamp(Math.round(confidence * 0.5 + (50 - risk) * 0.3 + (trajectory + 50) * 0.2), 0, 100);

  return { confidence, risk, trajectory, overall };
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }