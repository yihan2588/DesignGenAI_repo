// Hosting proxies may give Next.js an internal request URL. Use the public host.
export function requestOrigin(headers: Pick<Headers, "get">) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) throw new Error("Request host is missing.");
  const local = host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
  return `${local ? "http" : "https"}://${host}`;
}
