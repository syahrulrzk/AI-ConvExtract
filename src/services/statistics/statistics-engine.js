export function generateStatistics(messages, processingTime) {
  let promptCount = 0;
  let assistantCount = 0;
  let wordCount = 0;
  let characterCount = 0;

  let summaryInput = '';

  for (const msg of messages) {
    if (msg.role === 'user') {
      promptCount++;
      if (promptCount === 1) {
        summaryInput = msg.content;
      }
    } else if (msg.role === 'assistant') {
      assistantCount++;
    }

    const text = msg.content || '';
    characterCount += text.length;
    // Basic word count split by whitespace
    const words = text.trim().split(/\s+/);
    if (words.length > 0 && words[0] !== '') {
      wordCount += words.length;
    }
  }

  return {
    promptCount,
    assistantCount,
    totalMessages: messages.length,
    summaryInput,
    wordCount,
    characterCount,
    processingTime,
    // Human-readable duration (e.g. "2m 8s") — easier to scan than raw ms
    processingTimeLabel: formatDuration(processingTime)
  };
}

/**
 * Format a millisecond duration for humans: "45s", "2m 8s", "1h 12m".
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}
