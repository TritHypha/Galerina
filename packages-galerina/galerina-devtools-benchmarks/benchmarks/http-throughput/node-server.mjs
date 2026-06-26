/**
 * http-throughput: raw Node.js HTTP server (baseline)
 * Serves a simple JSON response — no framework, no governance overhead.
 */
import { createServer } from "node:http";

const PORT = 0; // OS assigns port

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/echo") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ echo: body.slice(0, 100), ts: Date.now() }));
    });
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", runtime: "nodejs-raw", ts: Date.now() }));
});

server.listen(PORT, "127.0.0.1", () => {
  const { port } = server.address();
  process.stdout.write(JSON.stringify({ port }) + "\n");
});
