import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { WebSocketServer } from "ws";
import { createRoomServer } from "./rooms.ts";

const PROD = process.env.NODE_ENV === "production" || process.argv.includes("--prod");
// In dev, PORT belongs to Vite (the client); the room server sits beside it.
const PORT = PROD ? Number(process.env.PORT || 43123) : Number(process.env.WS_PORT || 43124);
const DIST = join(process.cwd(), "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  if (!PROD) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Colonos WS " + PORT);
    return;
  }
  let path = req.url?.split("?")[0] || "/";
  if (path === "/") path = "/index.html";
  const file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    const fallback = join(DIST, "index.html");
    if (existsSync(fallback)) {
      res.writeHead(200, { "content-type": MIME[".html"] });
      res.end(readFileSync(fallback));
      return;
    }
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

const rooms = createRoomServer();
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
wss.on("connection", (ws) => rooms.attach(ws));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Colonos server em :${PORT} (${PROD ? "prod" : "dev ws"})`);
});
