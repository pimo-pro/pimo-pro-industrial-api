import type { Request, Response, NextFunction } from 'express';

export const STUB_TOKEN_SUPERVISOR = 'pimo-industrial-dev-token';
export const STUB_TOKEN_OPERATOR = 'pimo-industrial-operator-token';

export type IndustrialProfile = 'supervisor' | 'operator';

declare global {
  namespace Express {
    interface Request {
      industrialProfile?: IndustrialProfile;
    }
  }
}

const TOKEN_PROFILE: Record<string, IndustrialProfile> = {
  [STUB_TOKEN_SUPERVISOR]: 'supervisor',
  [STUB_TOKEN_OPERATOR]: 'operator',
};

export function authStub(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const profile = TOKEN_PROFILE[token];
  if (!profile) {
    res.status(401).json({
      error: 'Token inválido. Use Bearer pimo-industrial-dev-token (supervisor) ou pimo-industrial-operator-token (operador)',
    });
    return;
  }
  req.industrialProfile = profile;
  next();
}

export function requireSupervisor(req: Request, res: Response, next: NextFunction): void {
  if (req.industrialProfile !== 'supervisor') {
    res.status(403).json({ error: 'Acesso reservado a supervisores' });
    return;
  }
  next();
}
