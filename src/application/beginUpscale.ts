import { track } from './telemetry';
import Native, { type ImageInfo } from '../specs/NativeUpscale';

/** The caller presents preparation; native code still enforces size and consent. */
export async function beginUpscale(
  image: ImageInfo | null,
  scale: number,
  mode: string,
  confirmPreparation: (image: ImageInfo, scale: number) => Promise<boolean>,
  speed?: string,
  beforeStart?: () => Promise<boolean>,
) {
  if (!image) return null;
  if (image.needsPreparation) {
    const confirmed = await confirmPreparation(image, scale);
    track('preparation_decision', {
      profile_id: mode,
      scale,
      status: confirmed ? 'confirmed' : 'declined',
    });
    if (!confirmed) return null;
  }
  if (beforeStart && !(await beforeStart())) return null;
  if (speed !== undefined)
    return Native.startJobWithProfile(image.id, scale, mode, speed, true);
  return Native.startJobWithMode(image.id, scale, true, mode);
}
