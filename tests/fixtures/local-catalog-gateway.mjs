// Loopback adapter for the real PostgREST validation server, never imported by
// application code. PostgREST applies the migrated anonymous PostgreSQL RLS.
import { createServer } from "node:http";
const upstream = new URL(process.env.MEDBRIDGE_QA_REST_URL ?? "http://127.0.0.1:55433");
if (upstream.hostname !== "127.0.0.1") throw new Error("Local validation upstream required");
createServer(async (request, response) => {
  if (!request.url?.startsWith("/rest/v1/")) { response.writeHead(404).end(); return; }
  const path = request.url.slice("/rest/v1".length);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    const headers = { ...request.headers };
    delete headers.host;
    delete headers["content-length"];
    // The validation server is anonymous only. No hosted keys or sessions cross
    // this adapter; it has no authentication, storage or service-role endpoint.
    delete headers.authorization;
    delete headers.apikey;
    const result = await fetch(new URL(path, upstream), {
      method: request.method, headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch { response.writeHead(502).end('{"message":"Local validation server unavailable"}'); }
}).listen(Number(process.env.MEDBRIDGE_QA_GATEWAY_PORT ?? 55434), "127.0.0.1", () => console.log("Loopback catalog adapter ready"));
