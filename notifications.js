export async function discord(url, message) {
  if (!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url || "")) {
    throw Error("Configure DISCORD_WEBHOOK_URL in .env");
  }
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(6000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) throw Error("Discord HTTP " + response.status);
}
