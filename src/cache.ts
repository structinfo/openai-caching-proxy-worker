import { Redis } from '@upstash/redis/cloudflare';
import { Env } from './env';
import { getHeadersAsObject, objectHash } from './utils';

interface GetCacheKeyProps {
  method: string;
  path: string;
  authHeader: string | null;
  body: string | null;
}
export const getCacheKey = async (props: GetCacheKeyProps): Promise<string> => {
  // https://stackoverflow.com/a/40924449
  const propsWithoutUndefined = Object.keys(props).reduce((acc, key) => {
    const _acc: Record<string, any> = acc;
    let propValue = (props as any)[key];
    if (key === 'body' && propValue !== '') {
      try {
        const body = JSON.parse(propValue);
        propValue = JSON.stringify(body, Object.keys(body).sort());
      } catch (_error) {
        propValue = '';
      }
    }
    if (propValue !== null && propValue !== '') {
      _acc[key] = propValue;
    }
    return _acc;
  }, {});
  const hash = objectHash(propsWithoutUndefined);
  return hash;
};

interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// let value = await env.kv.get("to-do:123");

export class ResponseCache {
  redis: Redis;

  constructor({ env }: { env: Env }) {
    this.redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  read = async ({ cacheKey }: { cacheKey: string }): Promise<Response | null> => {
    const result = await this.redis.get(cacheKey);
    if (result) {
      // Note: Upstash seems to automatically parse it to JSON:
      const cachedResponse =
        typeof result === 'string' ? JSON.parse(result as string) : (result as CachedResponse);
      return new Response(cachedResponse.body, {
        headers: cachedResponse.headers,
        status: cachedResponse.status,
      });
    }
    return null;
  };

  write = async ({
    cacheKey,
    response,
    ttl,
  }: {
    cacheKey: string;
    response: Response;
    ttl: number | null;
  }): Promise<void> => {
    const body = await response.clone().text();
    const responseObject = {
      status: response.status,
      headers: getHeadersAsObject(response.headers),
      body: body ? body : null,
    };
    const options = ttl != null ? { ex: ttl } : {};
    await this.redis.set(cacheKey, JSON.stringify(responseObject), options);
  };
}
