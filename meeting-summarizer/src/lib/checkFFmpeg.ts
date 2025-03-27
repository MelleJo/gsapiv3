// src/lib/checkFFmpeg.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * Check if FFmpeg can be loaded properly, testing COOP/COEP headers
 * @returns A promise that resolves if FFmpeg loads properly, rejects with an error message if not
 */
export async function checkFFmpegLoading(): Promise<boolean> {
  try {
    console.log('Checking FFmpeg loading...');
    const ffmpeg = new FFmpeg();
    
    // Try to load FFmpeg with a short timeout
    const loadPromise = ffmpeg.load({
      coreURL: '/ffmpeg/ffmpeg-core.js',
      wasmURL: '/ffmpeg/ffmpeg-core.wasm'
    });
    
    // Add a timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('FFmpeg loading timed out')), 10000);
    });
    
    await Promise.race([loadPromise, timeoutPromise]);
    console.log('FFmpeg loaded successfully!');
    return true;
  } catch (error) {
    console.error('FFmpeg loading failed:', error);
    
    // Check for specific COOP/COEP errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('SharedArrayBuffer') || 
        errorMessage.includes('cross-origin') || 
        errorMessage.includes('CORS')) {
      console.error('FFmpeg failed to load due to COOP/COEP header issues. Check your server configuration.');
    }
    
    return false;
  }
}

/**
 * Checks if the browser environment supports FFmpeg WASM
 * @returns True if the browser supports WebAssembly and SharedArrayBuffer
 */
export function checkFFmpegSupport(): boolean {
  try {
    // Check for WebAssembly support
    if (typeof WebAssembly !== 'object') {
      return false;
    }
    
    // Check for SharedArrayBuffer support (needed for multi-threaded WASM)
    if (typeof SharedArrayBuffer !== 'function') {
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}