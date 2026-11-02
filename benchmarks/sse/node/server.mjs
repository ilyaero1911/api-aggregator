// Transport-only comparison with benchmarks/sse/go/main.go.
import http from "node:http";
let active = 0;
const server = http.createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ active }));
    return;
  }
  if (request.url !== "/events") {
    response.writeHead(404).end();
    return;
  }
  active += 1;
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
  });
  response.write('data: {"token":"hello"}\n\n');
  const timer = setInterval(
    () => response.write('data: {"token":"next"}\n\n'),
    100,
  );
  response.on("close", () => {
    clearInterval(timer);
    active -= 1;
  });
});
server.requestTimeout = 0;
server.listen(Number(process.env.PORT || 7092), "127.0.0.1", 2048);
