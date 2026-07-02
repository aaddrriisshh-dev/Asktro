'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './firebase';

interface AdminAuth {
  user: User | null;
  loading: boolean;
  adminRole: string | null;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const Ctx = createContext<AdminAuth>({
  user: null,
  loading: true,
  adminRole: null,
  isAdmin: false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Custom claims determine admin access (set by a Cloud Function).
        const token = await u.getIdTokenResult(true);
        setIsAdmin(token.claims.role === 'admin');
        setAdminRole((token.claims.adminRole as string) ?? null);
      } else {
        setIsAdmin(false);
        setAdminRole(null);
      }
      setLoading(false);
    });
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, adminRole, isAdmin, logout: () => signOut(auth) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
