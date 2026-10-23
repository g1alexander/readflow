import type { Construct } from 'constructs';

export function getCorsOrigins(scope: Construct): string[] {
  const corsOrigins: unknown = scope.node.tryGetContext('corsOrigins');
  if (
    !Array.isArray(corsOrigins) ||
    corsOrigins.length === 0 ||
    !corsOrigins.every((origin) => typeof origin === 'string' && origin.length > 0)
  ) {
    throw new Error('Context "corsOrigins" must be a non-empty array of origin strings');
  }
  return corsOrigins;
}
