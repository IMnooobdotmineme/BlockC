import { SMTPServer } from "smtp-server";
import { createServer } from "node:http";

// Local development mailbox only: messages are captured in memory and never forwarded.
const messages: string[] = [];
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const smtp = new SMTPServer({ disabledCommands: ["AUTH", "STARTTLS"], size: 65536, onData(stream, _session, callback) {
  const chunks: Buffer[] = [];
  let size = 0;
  stream.on("data", chunk => { size += chunk.length; if (size <= 65536) chunks.push(Buffer.from(chunk)); });
  stream.on("end", () => {
    if (size > 65536) return callback(new Error("Message too large for local mailbox."));
    messages.unshift(Buffer.concat(chunks).toString("utf8"));
    if (messages.length > 30) messages.pop();
    console.log(`Local mailbox captured a message (${messages.length} retained).`);
    callback();
  });
  stream.on("error", () => callback(new Error("Local capture failed.")));
} });
const inbox = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff" });
  response.end(`<!doctype html><html><head><title>Local certificate mailbox</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:20px;color:#1e293b}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f9;padding:20px;border-radius:12px}p{color:#64748b}</style></head><body><h1>Local certificate mailbox</h1><p>Captured email only; nothing is sent externally. Refresh to view new messages. Restart clears this inbox.</p>${messages.length ? messages.map((message, index) => `<h2>Message ${messages.length - index}</h2><pre>${escape(message)}</pre>`).join("") : "<p>No messages yet.</p>"}</body></html>`);
});
function failed() { console.error("Local mailbox could not start. Ensure ports 1025 and 8025 are free."); process.exitCode = 1; smtp.close(); inbox.close(); }
smtp.on("error", failed);
inbox.on("error", failed);
smtp.listen(1025, "127.0.0.1", () => console.log("Local SMTP capture listening on 127.0.0.1:1025."));
inbox.listen(8025, "127.0.0.1", () => console.log("Open http://127.0.0.1:8025 to inspect captured mail locally."));
process.on("SIGINT", () => { smtp.close(); inbox.close(); });
