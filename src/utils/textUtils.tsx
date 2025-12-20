import React from "react";

/**
 * Parses markdown-style bold text (**text**) and converts it to React elements
 * @param text - The text string that may contain **bold** markdown syntax
 * @returns React elements with bold text wrapped in <strong> tags, or the original text if no bold markers found
 */
export const parseBoldText = (
  text: string | null | undefined
): React.ReactNode => {
  if (!text) return null;

  // Use regex to find all **text** patterns
  const regex = /(\*\*[^*]+\*\*)/g;
  const parts: React.ReactElement[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{text.substring(lastIndex, match.index)}</span>
      );
    }

    // Add the bold text
    const boldText = match[0].slice(2, -2); // Remove **
    parts.push(
      <strong key={key++} className="font-semibold text-gray-900">
        {boldText}
      </strong>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.substring(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : text;
};
