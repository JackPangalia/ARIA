"use client";

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth } from "@/lib/firebase/client";
import { getKivoDesktop } from "@/lib/desktop/bridge";
import { upsertUserProfile } from "@/lib/firebase/profile";
import { track } from "@/lib/analytics/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong with authentication.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setLoading(false);

      if (!nextUser) return;

      // Fires on every sign-in; the funnel script dedupes to first-ever by uid.
      track("sign_up", { uid: nextUser.uid });

      try {
        await upsertUserProfile(nextUser);
      } catch (profileError) {
        setError(errorMessage(profileError));
      }
    });
  }, []);

  useEffect(() => {
    const desktop = getKivoDesktop();
    if (!desktop) return;

    const signInFromDesktop = async (token: string) => {
      setError(null);
      try {
        await signInWithCustomToken(auth, token);
      } catch (authError) {
        setError(errorMessage(authError));
      }
    };

    const unsubscribe = desktop.onAuthToken((token) => {
      void signInFromDesktop(token);
    });

    void desktop.getPendingAuthToken().then((token) => {
      if (token) void signInFromDesktop(token);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (authError) {
      setError(errorMessage(authError));
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (authError) {
        setError(errorMessage(authError));
      }
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (authError) {
        setError(errorMessage(authError));
      }
    },
    []
  );

  const signOutUser = useCallback(async () => {
    setError(null);
    try {
      await signOut(auth);
    } catch (authError) {
      setError(errorMessage(authError));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOutUser,
      clearError,
    }),
    [
      user,
      loading,
      error,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOutUser,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
