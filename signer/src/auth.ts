import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { claveServicioInvalida } from "./errors.js";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function requireServiceKey(expectedKey: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const received = req.header("X-Service-Key");
    if (!received || !safeEqual(received, expectedKey)) {
      next(claveServicioInvalida());
      return;
    }
    next();
  };
}
