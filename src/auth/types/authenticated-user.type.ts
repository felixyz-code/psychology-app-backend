import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isSuperAdmin?: boolean;
  sessionId?: string;
};

