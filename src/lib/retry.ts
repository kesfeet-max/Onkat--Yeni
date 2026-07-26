/**
 * Enterprise-grade retry utility with exponential backoff
 * Ağ kopmaları, yavaş bağlantılar ve anlık sunucu yoğunluklarında
 * otomatik yeniden deneme mekanizması sağlar.
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryOn?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelay: 500,
  maxDelay: 5000,
  backoffFactor: 2,
  retryOn: (error: any) => {
    // Ağ hataları, timeout, 5xx sunucu hataları için yeniden dene
    if (!error) return false;
    if (error.message?.includes('Failed to fetch')) return true;
    if (error.message?.includes('NetworkError')) return true;
    if (error.message?.includes('timeout')) return true;
    if (error.code === 'PGRST301') return true; // Connection pool exhausted
    if (error.status >= 500) return true;
    if (error.status === 429) return true; // Rate limit
    return false;
  },
  onRetry: () => {},
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt === opts.maxAttempts || !opts.retryOn(error)) {
        throw error;
      }

      const delay = Math.min(
        opts.baseDelay * Math.pow(opts.backoffFactor, attempt - 1),
        opts.maxDelay
      );

      // Jitter ekle (thundering herd önleme)
      const jitter = delay * (0.5 + Math.random() * 0.5);
      opts.onRetry(attempt, error);

      await new Promise(resolve => setTimeout(resolve, jitter));
    }
  }

  throw lastError;
}

/**
 * Supabase RPC çağrılarını retry ile saran yardımcı
 */
export async function resilientRpc<T>(
  supabase: any,
  fnName: string,
  params?: Record<string, any>,
  options?: RetryOptions
): Promise<{ data: T | null; error: any }> {
  return withRetry(async () => {
    const { data, error } = await supabase.rpc(fnName, params);
    if (error && (error.code === 'PGRST301' || error.message?.includes('connection'))) {
      throw error; // Retry'a düşsün
    }
    return { data, error };
  }, {
    maxAttempts: 3,
    baseDelay: 300,
    ...options,
  });
}

/**
 * Supabase sorgu çağrılarını retry ile saran yardımcı
 */
export async function resilientQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  options?: RetryOptions
): Promise<{ data: T | null; error: any }> {
  return withRetry(async () => {
    const result = await queryFn();
    if (result.error && (
      result.error.code === 'PGRST301' ||
      result.error.message?.includes('connection') ||
      result.error.message?.includes('timeout')
    )) {
      throw result.error; // Retry'a düşsün
    }
    return result;
  }, {
    maxAttempts: 3,
    baseDelay: 300,
    ...options,
  });
}