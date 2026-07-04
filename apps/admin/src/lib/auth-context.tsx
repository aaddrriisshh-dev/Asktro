'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AdminAuth {
  user: User | null;
  loading: boolean;
  adminRole: string | null;
  adminName: string;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const Ctx = createContext<AdminAuth>({
  user: null,
  loading: true,
  adminRole: null,
  adminName: '',
  isAdmin: false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Custom claims determine admin access (set by a Cloud Function).
        const token = await u.getIdTokenResult(true);
        const admin = token.claims.role === 'admin';
        setIsAdmin(admin);
        setAdminRole((token.claims.adminRole as string) ?? null);
        if (admin) {
          try {
            const p = await getDoc(doc(db, 'adminUsers', u.uid));
            setAdminName((p.data()?.name as string) ?? u.displayName ?? u.email ?? '');
          } catch { setAdminName(u.displayName ?? u.email ?? ''); }
        }
      } else {
        setIsAdmin(false);
        setAdminRole(null);
        setAdminName('');
      }
      setLoading(false);
    });
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, adminRole, adminName, isAdmin, logout: () => signOut(auth) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
