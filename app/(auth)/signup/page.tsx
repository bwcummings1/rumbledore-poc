'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Loader2, Trophy, AlertCircle, Check, X } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api/client';

// Password validation regex patterns
const passwordRegex = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /[0-9]/,
  special: /[!@#$%^&*(),.?":{}|<>]/,
};

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(passwordRegex.uppercase, 'Password must contain at least one uppercase letter')
    .regex(passwordRegex.lowercase, 'Password must contain at least one lowercase letter')
    .regex(passwordRegex.number, 'Password must contain at least one number')
    .regex(passwordRegex.special, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const password = form.watch('password');

  // Calculate password strength
  const calculatePasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (passwordRegex.uppercase.test(password)) strength += 25;
    if (passwordRegex.lowercase.test(password)) strength += 25;
    if (passwordRegex.number.test(password)) strength += 12.5;
    if (passwordRegex.special.test(password)) strength += 12.5;
    return strength;
  };

  // Update password strength when password changes
  const onPasswordChange = (value: string) => {
    setPasswordStrength(calculatePasswordStrength(value));
  };

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // Create user account via API
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create account');
      }

      // Automatically sign in after successful registration
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Account created but login failed. Please try logging in.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength < 50) return 'bg-destructive';
    if (passwordStrength < 75) return 'bg-warning';
    return 'bg-success';
  };

  const getPasswordStrengthText = () => {
    if (passwordStrength < 50) return 'Weak';
    if (passwordStrength < 75) return 'Fair';
    if (passwordStrength < 100) return 'Good';
    return 'Strong';
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background to-secondary/20">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Title */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="size-16 bg-primary rounded-full flex items-center justify-center">
              <Trophy className="size-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Join Rumbledore</h1>
          <p className="mt-2 text-muted-foreground">
            Create your account to get started
          </p>
        </div>

        {/* Signup Card */}
        <Card className="border-2">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl">Create account</CardTitle>
            <CardDescription>
              Enter your details to create your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="John Doe" 
                          autoComplete="name"
                          {...field} 
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="john@example.com" 
                          autoComplete="email"
                          {...field} 
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          autoComplete="new-password"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            onPasswordChange(e.target.value);
                          }}
                          disabled={isLoading}
                        />
                      </FormControl>
                      {password && (
                        <div className="space-y-2 mt-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Password strength:</span>
                            <span className={`font-medium ${passwordStrength >= 75 ? 'text-success' : 'text-muted-foreground'}`}>
                              {getPasswordStrengthText()}
                            </span>
                          </div>
                          <Progress value={passwordStrength} className="h-1.5" />
                          <div className="space-y-1 text-xs">
                            <PasswordRequirement 
                              met={password.length >= 8} 
                              text="At least 8 characters" 
                            />
                            <PasswordRequirement 
                              met={passwordRegex.uppercase.test(password)} 
                              text="One uppercase letter" 
                            />
                            <PasswordRequirement 
                              met={passwordRegex.lowercase.test(password)} 
                              text="One lowercase letter" 
                            />
                            <PasswordRequirement 
                              met={passwordRegex.number.test(password)} 
                              text="One number" 
                            />
                            <PasswordRequirement 
                              met={passwordRegex.special.test(password)} 
                              text="One special character" 
                            />
                          </div>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          autoComplete="new-password"
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create account'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-4">
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Already have an account?
                </span>
              </div>
            </div>
            
            <Link href="/auth/login" className="w-full">
              <Button variant="outline" className="w-full" size="lg">
                Sign in instead
              </Button>
            </Link>
            
            <p className="text-xs text-center text-muted-foreground">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="underline hover:text-primary">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="underline hover:text-primary">
                Privacy Policy
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {met ? (
        <Check className="size-3 text-success" />
      ) : (
        <X className="size-3 text-muted-foreground" />
      )}
      <span className={met ? 'text-success' : 'text-muted-foreground'}>
        {text}
      </span>
    </div>
  );
}