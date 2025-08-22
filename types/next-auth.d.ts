import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      roles?: string[];
      permissions?: string[];
    } & DefaultSession['user'];
  }

  /**
   * The shape of the user object returned in the OAuth providers' `profile` callback,
   * or the second parameter of the `session` callback, when using a database.
   */
  interface User extends DefaultUser {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    roles?: string[];
    permissions?: string[];
  }
}

declare module 'next-auth/jwt' {
  /**
   * Returned by the `jwt` callback and `getToken`, when using JWT sessions
   */
  interface JWT extends DefaultJWT {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    roles?: string[];
    permissions?: string[];
  }
}