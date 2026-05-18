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

export class TerminalError extends ExtractorError {}
