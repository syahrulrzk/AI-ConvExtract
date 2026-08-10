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
    processingTime
  };
}
