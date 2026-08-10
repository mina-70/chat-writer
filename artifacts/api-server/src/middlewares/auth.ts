import type { Request, Response, NextFunction } from "express";

export const AUTH_COOKIE = "auth";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.signedCookies?.[AUTH_COOKIE] === "ok") {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
