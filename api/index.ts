import app from "../server";

export default function handler(req: any, res: any) {
  // Restore original URL if rewritten by Vercel serverless gateway
  const candidateUrl =
    req.headers["x-matched-path"] ||
    req.headers["x-forwarded-url"] ||
    req.headers["x-vercel-matched-path"] ||
    req.headers["x-invoke-path"] ||
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

  // Ensure /api prefix is present for Express routing
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }

  return app(req, res);
}
