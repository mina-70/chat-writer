import { Router, type IRouter } from "express";
import { AUTH_COOKIE } from "../middlewares/auth";

const router: IRouter = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  signed: true,
  sameSite: "lax" as const,
  secure: process.env["NODE_ENV"] === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

router.post("/login", (req, res) => {
  const expected = process.env["APP_PASSWORD"];

  if (!expected) {
    req.log.error("APP_PASSWORD is not configured");
    res.status(500).json({ error: "Server is not configured" });
    return;
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (password !== expected) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  res.cookie(AUTH_COOKIE, "ok", COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  const authenticated = req.signedCookies?.[AUTH_COOKIE] === "ok";
  res.json({ authenticated });
});

export default router;
