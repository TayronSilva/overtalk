export function createInMemoryRateLimiter({ limit, windowMs, keyPrefix = 'default' }) {
  const buckets = new Map();

  return {
    consume(key) {
      const now = Date.now();
      const bucketKey = `${keyPrefix}:${key}`;
      const bucket = buckets.get(bucketKey);

      if (!bucket || now - bucket.startedAt >= windowMs) {
        buckets.set(bucketKey, { startedAt: now, count: 1 });
        return true;
      }

      if (bucket.count >= limit) {
        return false;
      }

      bucket.count += 1;
      return true;
    },
  };
}
