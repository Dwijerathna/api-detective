// Slack Incoming Webhook (legacy) — JSON body { "text": "..." }.

/**
 * @param {string} webhookUrl
 * @param {string} text
 */
export async function postSlackIncoming(webhookUrl, text) {
  const r = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    throw new Error(`Slack webhook HTTP ${r.status}`);
  }
}
