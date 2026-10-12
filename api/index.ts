import app from "../server.js";

export default async function handler(req: any, res: any) {
  try {
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

    // 2. Safe URL Normalization for Vercel Rewrites
    let targetUrl =
      req.headers["x-matched-path"] ||
      req.headers["x-forwarded-url"] ||
      req.headers["x-vercel-original-url"] ||
      req.headers["x-real-path"] ||
      req.url;

    // Handle rewrite capture groups if query contains path
    if (req.query && (req.query["0"] || req.query.path || req.query.slug)) {
      const subpath = req.query["0"] || req.query.path || req.query.slug;
      const cleanSub = (Array.isArray(subpath) ? subpath.join("/") : String(subpath)).replace(/^\/+/, "");
      if (cleanSub.startsWith("api/")) {
        targetUrl = `/${cleanSub}`;
      } else {
        targetUrl = `/api/${cleanSub}`;
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

    // Preserve query string if missing
    if (
      req.url &&
      !req.url.includes("?") &&
      typeof req.headers["x-forwarded-url"] === "string" &&
      req.headers["x-forwarded-url"].includes("?")
    ) {
      const origQ = req.headers["x-forwarded-url"].split("?")[1];
      if (origQ) req.url += `?${origQ}`;
    }

    // 3. Keep Lambda alive until Express finishes sending the response
    return await new Promise((resolve, reject) => {
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
  } catch (fatalErr: any) {
    console.error("Fatal Vercel Function Invocation Error:", fatalErr);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Function Invocation Error",
        message: fatalErr?.message || "Unknown error"
      });
    }
  }
}
