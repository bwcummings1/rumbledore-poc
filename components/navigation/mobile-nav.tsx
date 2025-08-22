'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Trophy, DollarSign, BarChart3, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home, path: '/' },
  { id: 'leagues', label: 'Leagues', icon: Trophy, path: '/leagues' },
  { id: 'rumble', label: 'Rumble', icon: DollarSign, path: '/rumble' },
  { id: 'stats', label: 'Stats', icon: BarChart3, path: '/stats' },
  { id: 'more', label: 'More', icon: Menu, path: '#' },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);
  
  // TODO: Replace with real notification count
  const unreadCount = 0;

  const handleNavClick = (item: typeof NAV_ITEMS[0]) => {
    if (item.id === 'more') {
      setShowMore(!showMore);
    } else {
      router.push(item.path);
      setShowMore(false);
    }
  };

  return (
    <>
      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t">
          <nav className="flex items-center justify-around h-16">
            {NAV_ITEMS.map((item) => {
              const isActive = item.path !== '#' && (
                pathname === item.path || 
                (item.path !== '/' && pathname.startsWith(item.path))
              );
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 h-full relative",
                    "transition-colors duration-200",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <div className="relative">
                    <Icon className={cn(
                      "h-5 w-5 transition-transform",
                      isActive && "scale-110"
                    )} />
                    {item.id === 'more' && unreadCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] mt-1 transition-opacity",
                    isActive ? "opacity-100" : "opacity-70"
                  )}>
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute top-0 left-2 right-2 h-0.5 bg-primary"
                      initial={false}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* More Menu Sheet */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed bottom-16 left-0 right-0 z-50 bg-background border-t lg:hidden"
            >
              <div className="p-4 space-y-2">
                <NavLink 
                  href="/news" 
                  icon="📰" 
                  label="Fantasy News" 
                  onClick={() => setShowMore(false)}
                />
                <NavLink 
                  href="/chat" 
                  icon="💬" 
                  label="AI Assistant" 
                  onClick={() => setShowMore(false)}
                />
                <NavLink 
                  href="/schedule" 
                  icon="📅" 
                  label="Schedule" 
                  onClick={() => setShowMore(false)}
                />
                <NavLink 
                  href="/teams" 
                  icon="👥" 
                  label="My Teams" 
                  onClick={() => setShowMore(false)}
                />
                <NavLink 
                  href="/history" 
                  icon="🏆" 
                  label="History" 
                  onClick={() => setShowMore(false)}
                />
                <NavLink 
                  href="/settings" 
                  icon="⚙️" 
                  label="Settings" 
                  onClick={() => setShowMore(false)}
                />
                <NavLink 
                  href="/help" 
                  icon="❓" 
                  label="Help & Support" 
                  onClick={() => setShowMore(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavLink({ 
  href, 
  icon, 
  label, 
  onClick 
}: { 
  href: string; 
  icon: string; 
  label: string;
  onClick?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
  
  const handleClick = () => {
    router.push(href);
    onClick?.();
  };
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center gap-3 w-full p-3 rounded-lg transition-colors",
        isActive 
          ? "bg-primary text-primary-foreground" 
          : "hover:bg-accent"
      )}
    >
      <span className="text-xl">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}