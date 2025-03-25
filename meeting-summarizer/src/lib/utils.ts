import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Helper function to add retry logic with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param delay Initial delay in ms (will be multiplied by attempt number)
 * @returns The result of the function or throws the last error
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.log(`Attempt ${attempt} failed. ${attempt < maxRetries ? 'Retrying...' : 'Giving up.'}`);
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

/**
 * Helper function to add a timeout to any promise
 * @param promise The promise to add a timeout to
 * @param timeoutMs Timeout in milliseconds
 * @param errorMessage Custom error message
 * @returns The result of the promise or throws a timeout error
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage?: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutHandle);
  }) as Promise<T>;
}
