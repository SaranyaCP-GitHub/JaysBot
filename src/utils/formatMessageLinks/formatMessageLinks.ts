/**
 * Formats message text with links from API response
 * Handles link extraction, formatting, and message cleanup
 * 
 * @param messageText - The original message text from the API
 * @param links - Array of links from the API response
 * @returns Formatted message with links appended and cleaned
 */
export const formatMessageLinks = (
  messageText: string,
  links?: string[]
): string => {
  let formattedMessage = messageText;

  // Handle links if they exist
  if (links && links.length > 0) {
    const linkTexts = formattedMessage.split(", ");
    let formattedLinks = "\n\nRelevant links:\n";
    
    links.forEach((link, index) => {
      const cleanedLink = link.replace(/<|>|\[|\]/g, "");
      const linkText = linkTexts[index]
        ? linkTexts[index].trim()
        : `Link ${index + 1}`;
      formattedLinks += `- ${linkText}: ${cleanedLink}\n`;
    });
    
    formattedMessage += formattedLinks;
  }

  // Clean up message formatting
  formattedMessage = formattedMessage
    .replace(/<link>/g, "")
    .replace(/, $/, "");
  formattedMessage = formattedMessage.replace(/\s*\.:\s*/g, "");

  return formattedMessage;
};

