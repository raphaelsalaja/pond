export class ExtractorError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedError extends ExtractorError {}

export class AuthRequiredError extends ExtractorError {
  constructor(
    message?: string,
    public source?: string,
  ) {
    super(message);
  }
}

export class RateLimitedError extends ExtractorError {
  constructor(
    public retryAfterSec?: number,
    message?: string,
  ) {
    super(message ?? "rate limited");
  }
}

export class GeoRestrictedError extends ExtractorError {
  constructor(
    public countries?: string[],
    message?: string,
  ) {
    super(message ?? "geo restricted");
  }
}

export class TransientError extends ExtractorError {}

/**
 * The capture did what it could; only a secondary field is still missing.
 * Retrying is worthwhile, but the source is healthy, so it must not count
 * toward the source circuit breaker.
 */
export class CaptureIncompleteError extends TransientError {}

export class TerminalError extends ExtractorError {}
