import { auth } from "@/lib/auth/auth";

export class UnauthorizedError extends Error {
  code = "UNAUTHORIZED";
  status = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getRequiredSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return session;
}

