/**
 * Detect whether a chat message belongs to the current user.
 *
 * `sessionId` (server-assigned clientId) can change on reconnect, so older
 * messages may carry an `authorId` that no longer matches. Fall back to a
 * normalized author-vs-player name comparison so the user keeps owning their
 * own bubbles across reconnects.
 */
export function isOwnChatMessage(
  authorId: string,
  authorName: string,
  sessionId: string,
  playerName: string,
): boolean {
  if (authorId && authorId === sessionId) return true;
  const normalizedAuthor = normalizeChatName(authorName);
  const normalizedPlayer = normalizeChatName(playerName);
  return Boolean(normalizedAuthor && normalizedPlayer && normalizedAuthor === normalizedPlayer);
}

export function normalizeChatName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
