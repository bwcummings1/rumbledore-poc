import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/auth-config';
import { AdminSidebar } from '@/components/admin/sidebar';
import { AdminHeader } from '@/components/admin/header';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/admin/login');
  }

  // Check if user has admin access
  const hasAdminAccess = session.user.roles?.some((role: string) => 
    ['SUPER_ADMIN', 'LEAGUE_OWNER', 'LEAGUE_ADMIN'].includes(role)
  );

  if (!hasAdminAccess) {
    redirect('/unauthorized');
  }

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar user={session.user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader user={session.user} />
        <main className="flex-1 overflow-y-auto bg-muted/10">
          <div className="container mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}