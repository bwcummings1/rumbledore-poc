'use client';

import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, XCircle, RefreshCw, Home, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const errorMessages: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Configuration Error',
    description: 'There is a problem with the server configuration. Please contact support.',
  },
  AccessDenied: {
    title: 'Access Denied',
    description: 'You do not have permission to access this resource.',
  },
  Verification: {
    title: 'Verification Required',
    description: 'Please verify your email address before signing in.',
  },
  Default: {
    title: 'Authentication Error',
    description: 'An error occurred during authentication. Please try again.',
  },
  CredentialsSignin: {
    title: 'Invalid Credentials',
    description: 'The email or password you entered is incorrect.',
  },
  SessionRequired: {
    title: 'Session Required',
    description: 'You must be signed in to access this page.',
  },
  OAuthSignin: {
    title: 'OAuth Sign In Error',
    description: 'Error occurred while signing in with OAuth provider.',
  },
  OAuthCallback: {
    title: 'OAuth Callback Error',
    description: 'Error occurred during OAuth callback.',
  },
  EmailCreateAccount: {
    title: 'Account Creation Failed',
    description: 'Could not create account with this email address.',
  },
  EmailSignin: {
    title: 'Email Sign In Error',
    description: 'Could not send sign in email. Please try again.',
  },
  Callback: {
    title: 'Callback Error',
    description: 'Error occurred during authentication callback.',
  },
};

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error') || 'Default';
  
  const { title, description } = errorMessages[error] || errorMessages.Default;

  const handleRetry = () => {
    router.push('/auth/login');
  };

  const getIcon = () => {
    switch (error) {
      case 'AccessDenied':
        return <XCircle className="h-12 w-12 text-destructive" />;
      case 'Configuration':
        return <AlertTriangle className="h-12 w-12 text-warning" />;
      default:
        return <AlertTriangle className="h-12 w-12 text-destructive" />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background to-secondary/20">
      <div className="w-full max-w-md space-y-8">
        <Card className="border-2">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              {getIcon()}
            </div>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription className="text-base mt-2">
              {description}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>What happened?</AlertTitle>
              <AlertDescription className="mt-2">
                {error === 'CredentialsSignin' && (
                  <div className="space-y-2">
                    <p>Please check that:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>Your email address is correct</li>
                      <li>Your password is correct</li>
                      <li>Your account has been verified</li>
                    </ul>
                  </div>
                )}
                {error === 'AccessDenied' && (
                  <p>
                    You tried to access a page that requires special permissions. 
                    If you believe this is a mistake, please contact your league administrator.
                  </p>
                )}
                {error === 'Configuration' && (
                  <p>
                    There&apos;s a technical issue on our end. Our team has been notified 
                    and is working to resolve it. Please try again later.
                  </p>
                )}
                {error === 'Verification' && (
                  <p>
                    Check your email for a verification link. If you didn&apos;t receive it, 
                    you can request a new one from the login page.
                  </p>
                )}
                {!['CredentialsSignin', 'AccessDenied', 'Configuration', 'Verification'].includes(error) && (
                  <p>
                    Error code: <code className="text-xs bg-secondary px-1 py-0.5 rounded">{error}</code>
                  </p>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
          
          <CardFooter className="flex flex-col gap-3">
            <div className="flex gap-3 w-full">
              <Button 
                onClick={handleRetry}
                className="flex-1"
                variant="default"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Link href="/" className="flex-1">
                <Button variant="outline" className="w-full">
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
              </Link>
            </div>
            
            {error === 'CredentialsSignin' && (
              <div className="w-full space-y-3">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Need help?
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Link href="/auth/forgot-password" className="flex-1">
                    <Button variant="ghost" size="sm" className="w-full">
                      Reset password
                    </Button>
                  </Link>
                  <Link href="/auth/signup" className="flex-1">
                    <Button variant="ghost" size="sm" className="w-full">
                      Create account
                    </Button>
                  </Link>
                </div>
              </div>
            )}
            
            <p className="text-xs text-center text-muted-foreground mt-2">
              If this problem persists, please{' '}
              <Link href="/support" className="underline hover:text-primary">
                contact support
              </Link>
              {' '}with error code: {error}
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}