export function assistanceHref(kind: string, id: string, source: string, conversationId?: string) {
  return `/request-assistance?kind=${encodeURIComponent(kind)}&entityId=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}${conversationId ? `&conversation=${encodeURIComponent(conversationId)}` : ''}`;
}
