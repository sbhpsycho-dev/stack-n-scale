const TOKEN = "8b0d2a1a-a0ab-49c9-818e-ba1d0ad7d32a";
const resp = await fetch("https://us2.make.com/api/v2/scenarios/4869898/blueprint", {
  headers: { "Authorization": `Token ${TOKEN}` }
});
const outer = await resp.json();
const bp = JSON.parse(outer.response.blueprint);
const router = bp.flow[1];
console.log("Routes:", router.routes.length);
router.routes.forEach(r => {
  const m = r.flow[0];
  console.log(" -", m.filter?.name, "|", m.filter?.conditions[0][0].b);
});
// Also verify idVerificationUrl in webhook interface
const hook = bp.flow[0];
const fields = hook.metadata.interface.map(i => i.name);
console.log("\nWebhook interface fields:", fields.join(", "));
