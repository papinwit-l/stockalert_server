const NTFY_BASE_URL = process.env.NTFY_BASE_URL || "https://ntfy.sh";

/**
 * Send a push notification via ntfy.sh
 * @param {string} topic - user's unique ntfy topic
 * @param {string} title - notification title
 * @param {string} message - notification body
 * @param {string} priority - "min", "low", "default", "high", "urgent"
 * @param {string[]} tags - emoji tags, e.g. ["chart_with_upwards_trend", "warning"]
 */
async function sendNotification(topic, title, message, priority = "high", tags = []) {
  try {
    const response = await fetch(`${NTFY_BASE_URL}/${topic}`, {
      method: "POST",
      headers: {
        Title: title,
        Priority: priority,
        Tags: tags.join(","),
      },
      body: message,
    });

    if (!response.ok) {
      throw new Error(`ntfy error: ${response.status} ${response.statusText}`);
    }

    console.log(`[ntfy] Sent to topic "${topic}": ${title}`);
    return true;
  } catch (error) {
    console.error(`[ntfy] Failed to send: ${error.message}`);
    return false;
  }
}

/**
 * Format and send a stock alert notification
 */
async function sendStockAlert(ntfyTopic, stock, alert) {
  const conditionLabels = {
    PRICE_ABOVE: `crossed above $${alert.threshold}`,
    PRICE_BELOW: `dropped below $${alert.threshold}`,
    PERCENT_UP: `up ${alert.threshold}%+ today`,
    PERCENT_DOWN: `down ${alert.threshold}%+ today`,
    VOLUME_SPIKE: `volume spike (${alert.threshold}x avg)`,
  };

  const title = `${stock.symbol} Alert`;
  const description = conditionLabels[alert.condition] || alert.condition;
  const changeSign = stock.dayChangePercent >= 0 ? "+" : "";

  const message = [
    `${stock.symbol} - ${stock.name}`,
    `Price: $${stock.lastPrice.toFixed(2)} (${changeSign}${stock.dayChangePercent.toFixed(2)}%)`,
    `Trigger: ${description}`,
    `Mode: ${alert.notifyMode}`,
  ].join("\n");

  const tags =
    stock.dayChangePercent >= 0
      ? ["chart_with_upwards_trend"]
      : ["chart_with_downwards_trend", "warning"];

  return sendNotification(ntfyTopic, title, message, "high", tags);
}

module.exports = { sendNotification, sendStockAlert };
