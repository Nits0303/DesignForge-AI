"use client";

import { useSession } from "next-auth/react";

export function useCurrentUser() {
  const { data, status } = useSession();
  return {
    user: data?.user
      ? {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          avatarUrl: data.user.image,
        }
      : null,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
  };
}

