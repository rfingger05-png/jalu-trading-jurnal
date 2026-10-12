import app from "../server";

export default async function handler(req: any, res: any) {
  // 1. Safe Body Normalization for Vercel Serverless
  if (typeof req.body === "string") {
    try {
      req.body = JSON.parse(req.body);
    } catch {}
    req._body = true;
  } else if (Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(req.body.toString("utf8"));
    } catch {}
    req._body = true;
  } else if (req.body !== undefined && req.body !== null && typeof req.body === "object") {
    req._body = true;
  } else if (!req.body && (req.method === "POST" || req.method === "PUT" || req.method === "PATCH")) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      if (chunks.length > 0) {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          req.body = JSON.parse(raw);
        } catch {
          req.body = raw;
        }
      } else {
        req.body = {};
      }
      req._body = true;
    } catch {
      req.body = req.body || {};
      req._body = true;
    }
  }

  // 2. Safe URL Normalization (do NOT use x-matched-path which contains the internal lambda file path /api/index)
  const candidateUrl =
    req.headers["x-forwarded-url"] ||
    req.headers["x-vercel-original-url"] ||
    req.headers["x-real-path"] ||
    req.headers["x-original-url"] ||
    req.url;

  if (candidateUrl && typeof candidateUrl === "string") {
    try {
      const parsed = new URL(candidateUrl, "https://dummy.local");
      let pathname = parsed.pathname;
      if (!pathname.startsWith("/api")) {
        pathname = "/api" + (pathname.startsWith("/") ? pathname : "/" + pathname);
      }
      req.url = pathname + (parsed.search || "");
    } catch {
      if (!candidateUrl.startsWith("/api")) {
        req.url = "/api" + (candidateUrl.startsWith("/") ? candidateUrl : "/" + candidateUrl);
      } else {
        req.url = candidateUrl;
      }
    }
  }

  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }

  return app(req, res);
}
