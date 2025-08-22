import { useEffect, useState } from 'react';

/**
 * Custom hook for responsive design
 * @param query - Media query string (e.g., '(max-width: 640px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window === 'undefined') {
      return;
    }

    // Create media query list
    const mediaQuery = window.matchMedia(query);
    
    // Set initial value
    setMatches(mediaQuery.matches);

    // Define listener
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    // Cleanup
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        // Fallback for older browsers
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [query]);

  return matches;
}

// Preset breakpoints matching Tailwind's default breakpoints
export const BREAKPOINTS = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
} as const;

// Convenience hooks for common breakpoints
export function useIsMobile() {
  return !useMediaQuery(BREAKPOINTS.sm);
}

export function useIsTablet() {
  const isAboveMobile = useMediaQuery(BREAKPOINTS.sm);
  const isBelowDesktop = !useMediaQuery(BREAKPOINTS.lg);
  return isAboveMobile && isBelowDesktop;
}

export function useIsDesktop() {
  return useMediaQuery(BREAKPOINTS.lg);
}

// Hook to get current breakpoint
export function useBreakpoint() {
  const is2xl = useMediaQuery(BREAKPOINTS['2xl']);
  const isXl = useMediaQuery(BREAKPOINTS.xl);
  const isLg = useMediaQuery(BREAKPOINTS.lg);
  const isMd = useMediaQuery(BREAKPOINTS.md);
  const isSm = useMediaQuery(BREAKPOINTS.sm);

  if (is2xl) return '2xl';
  if (isXl) return 'xl';
  if (isLg) return 'lg';
  if (isMd) return 'md';
  if (isSm) return 'sm';
  return 'xs';
}