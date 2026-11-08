export type FailureCode =
  | 'unsupported' | 'permission-required' | 'unavailable' | 'cancelled'
  | 'invalid-data' | 'unsupported-version' | 'limit-exceeded' | 'conflict'
  | 'busy' | 'verification-failed' | 'partial-change' | 'io-error';

export class ArchiveFailure extends Error {
  constructor(
    public readonly code: FailureCode,
    message: string,
    public readonly affectedPaths: string[] = [],
    public readonly recoveryPaths: string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ArchiveFailure';
  }
}

export function requireValue(condition: unknown, message: string, code: FailureCode = 'invalid-data'): asserts condition {
  if (!condition) throw new ArchiveFailure(code, message);
}

export function permissionRequired(error: unknown): boolean {
  return failure(error).code === 'permission-required' ||
    (error instanceof Error && error.cause !== undefined && permissionRequired(error.cause));
}

export function failure(error: unknown): ArchiveFailure {
  if (error instanceof ArchiveFailure) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const code: FailureCode = name === 'AbortError' ? 'cancelled'
    : name === 'NotAllowedError' || name === 'SecurityError' ? 'permission-required'
    : name === 'NotFoundError' ? 'unavailable' : 'io-error';
  return new ArchiveFailure(code, message, [], [], { cause: error });
}
