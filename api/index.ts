import app from "../server";

export default function handler(req: any, res: any) {
  // 1. Safe Body Normalization for Vercel Serverless
  if (typeof req.body === "string") {
    try {
      req.body = JSON.parse(req.body);
    } catch {}
    (req as any)._body = true;
  } else if (Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(req.body.toString("utf8"));
    } catch {}
    (req as any)._body = true;
  } else if (req.body !== undefined && req.body !== null && typeof req.body === "object") {
    (req as any)._body = true;
  }

  // 2. Safe URL Normalization
  let targetUrl =
    req.headers["x-forwarded-url"] ||
    req.headers["x-vercel-original-url"] ||
    req.headers["x-real-path"] ||
    req.url;

  // Handle rewrite capture groups if targetUrl was rewritten to /api/index
  if (
    typeof targetUrl === "string" &&
    (targetUrl.startsWith("/api/index") || targetUrl === "/api" || targetUrl === "/api/")
  ) {
    if (req.query && (req.query["0"] || req.query.path || req.query.slug)) {
      const subpath = req.query["0"] || req.query.path || req.query.slug;
      targetUrl = `/api/${Array.isArray(subpath) ? subpath.join("/") : subpath}`;
    }
  }

  if (targetUrl && typeof targetUrl === "string") {
    try {
      const parsed = new URL(targetUrl, "https://dummy.local");
      let pathname = parsed.pathname;
      if (!pathname.startsWith("/api")) {
        pathname = "/api" + (pathname.startsWith("/") ? pathname : "/" + pathname);
      }
      req.url = pathname + (parsed.search || "");
    } catch {
      if (!targetUrl.startsWith("/api")) {
        req.url = "/api" + (targetUrl.startsWith("/") ? targetUrl : "/" + targetUrl);
      } else {
        req.url = targetUrl;
      }
    }
  }

  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }

  // 3. Keep Lambda alive until Express finishes sending the response
  return new Promise((resolve, reject) => {
    res.on("finish", resolve);
    res.on("close", resolve);
    res.on("error", (err: any) => {
      console.error("Vercel response stream error:", err);
      reject(err);
    });

    try {
      app(req, res);
    } catch (err: any) {
      console.error("Vercel express execution error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || "Internal Server Error" });
      }
      resolve(undefined);
    }
  });
}
