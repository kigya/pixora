import type {
  ImageRecommendation,
  ProfileAvailability,
} from '../specs/NativeUpscale';

export class RecommendationRequestGate {
  private sequence = 0;

  begin() {
    this.sequence += 1;
    return this.sequence;
  }

  invalidate() {
    this.sequence += 1;
  }

  accepts(
    request: number,
    imageId: string,
    value: ImageRecommendation | null,
    availability: ProfileAvailability,
  ) {
    return (
      request === this.sequence &&
      value !== null &&
      value.imageId === imageId &&
      availability[value.profileId]
    );
  }
}
