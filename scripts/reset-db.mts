// Resets the demo database to the documented baseline: npm run db:reset
const { resetScenario } = await import("@/server/services/reset");
resetScenario("cli");
console.log("AMAN 360 demo database reset to baseline (training scenario, synthetic data).");
