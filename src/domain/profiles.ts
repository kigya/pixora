import type { ProfileId, ProcessingSpeed } from '../specs/NativeUpscale';
export const profileIds: ReadonlyArray<ProfileId> = [
  'standard',
  'lite',
  'natural',
  'details',
  'balanced',
  'sharp',
  'art',
  'pixel',
];
export function publicProfile(mode: string): ProfileId {
  if (mode === 'quality') return 'standard';
  if (mode === 'fast') return 'lite';
  if (mode === 'illustration' || mode === 'illustration-fast') return 'art';
  return profileIds.includes(mode as ProfileId)
    ? (mode as ProfileId)
    : 'standard';
}
export function aiSize(
  width: number,
  height: number,
  speed: ProcessingSpeed,
  profile: ProfileId,
) {
  const factor =
    speed === 'fast' && profile !== 'pixel'
      ? Math.min(1, 512 / Math.max(width, height))
      : 1;
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
}
