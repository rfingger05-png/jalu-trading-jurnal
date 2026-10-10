import app from "../server";

export default function handler(req: any, res: any) {
  // Restore original URL if rewritten by Vercel or proxy
  const forwardedUrl = req.headers["x-forwarded-url"] || req.headers["x-matched-path"] || req.headers["x-vercel-matched-path"];
  if (forwardedUrl && typeof forwardedUrl === "string") {
    try {
      const parsed = new URL(forwardedUrl, "https://dummy.local");
      if (parsed.pathname.startsWith("/api")) {
        req.url = parsed.pathname + parsed.search;
      }
    } catch {
      if (forwardedUrl.startsWith("/api")) {
        req.url = forwardedUrl;
      }
    }
  }

  // Ensure /api prefix for Express routing in serverless function
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }

  return app(req, res);
}
