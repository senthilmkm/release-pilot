import { useColorScheme } from 'react-native';

/**
 * `useColorScheme()` can return `'light' | 'dark' | null | 'unspecified'`
 * depending on platform timing. Most of the time we just want "light or
 * dark, no nulls." This helper narrows the type once.
 *
 * Use this everywhere instead of `useColorScheme() ?? 'light'`.
 */
export function useResolvedScheme(): 'light' | 'dark' {
  const scheme = useColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}
