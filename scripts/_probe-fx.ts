const t0 = Date.now();
import("../src/lib/bots/fixtures").then((m) => {
  console.log("fixtures loaded in", Date.now() - t0, "ms; engineBuild is", typeof m.engineBuild);
}).catch((e) => console.log("FAIL", String(e).slice(0, 300)));
