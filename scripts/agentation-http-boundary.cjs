const http = require("node:http");
const net = require("node:net");

const createServer = http.createServer;
const listen = net.Server.prototype.listen;

function acceptsBrowserOrigin(request) {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  const host = request.headers.host;
  if (host === undefined) return false;
  try {
    const parsed = new URL(origin);
    const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    return parsed.protocol === "http:" && isLoopback && parsed.host === host;
  } catch {
    return false;
  }
}

// Reject cross-origin browser access before agentation-mcp adds permissive CORS headers.
http.createServer = function createProtectedServer(...args) {
  const listener = args[0];
  if (typeof listener === "function") {
    args[0] = function protectedListener(request, response) {
      if (!acceptsBrowserOrigin(request)) {
        response.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end('{"error":"Forbidden origin"}');
        return;
      }
      return listener.call(this, request, response);
    };
  }
  return createServer.apply(this, args);
};

// agentation-mcp 1.2.0 does not expose a host option. Constrain its port-only
// HTTP listener to exact loopback without changing the package in node_modules.
net.Server.prototype.listen = function listenOnLoopback(...args) {
  if (typeof args[0] === "number" && (args[1] === undefined || typeof args[1] === "function")) {
    args.splice(1, 0, "127.0.0.1");
  }
  return listen.apply(this, args);
};
