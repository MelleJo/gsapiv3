// src/app/api/direct-transcribe/route.ts
import { NextResponse } from 'next/server';
// Corrected import: Use default import if 'openai' is the default export
import openai from '../../../lib/openai'; // Ensure correct path
import { formatBytes } from '../../../lib/enhancedAudioChunker'; // Ensure correct path
import { Readable } from 'stream'; // Needed for older Node versions if fetch body isn't directly usable

// Vercel Serverless function config (best set in vercel.json)
// export const config = { ... }; // Keep if needed, but sizeLimit handled by URL approach
export const runtime = 'nodejs'; // Can potentially be 'edge' if OpenAI SDK supports it fully
export const maxDuration = 720; // 12 minutes

// OpenAI Whisper limit (slightly less for safety margin)
const WHISPER_MAX_SIZE_BYTES = 25 * 1024 * 1024 * 0.98; // ~24.5 MB

// Define an interface for the expected request body
interface RequestBody {
  audioUrl?: string; // Changed from blobUrl to audioUrl for clarity
  model?: string;    // Optional: Model ID override
  language?: string; // Optional: Language override
  prompt?: string;   // Optional: Prompt for context
}

export async function POST(request: Request) {
  console.log('🚀 Direct-transcribe endpoint hit');

  let requestBody: RequestBody;
  try {
    // Ensure the request body is parsed as JSON
    if (!request.headers.get('content-type')?.includes('application/json')) {
      console.error('❌ Invalid content type, expected application/json');
      return NextResponse.json({ error: 'Invalid request body. Expected JSON with audioUrl.' }, { status: 400 });
    }
    requestBody = await request.json();
  } catch (error) {
    console.error('❌ Error parsing request body:', error);
    return NextResponse.json({ error: 'Invalid request body format.' }, { status: 400 });
  }

  const { audioUrl, model: modelId = 'whisper-1', language = 'nl', prompt } = requestBody;

  if (!audioUrl) {
    console.error('❌ Missing audioUrl in request body');
    return NextResponse.json({ error: 'Missing audioUrl in request body' }, { status: 400 });
  }

  // Use try-catch for URL parsing as URL.canParse might not exist in all Node versions
  try {
    new URL(audioUrl);
  } catch (_) {
    console.error(`❌ Invalid audioUrl received: ${audioUrl}`);
    return NextResponse.json({ error: 'Invalid audio URL format provided' }, { status: 400 });
  }


  console.log(`🔄 Received request to transcribe audio from URL: ${audioUrl}`);

  try {
    // 1. Fetch the audio file from Vercel Blob (or any URL)
    console.log('⬇️ Fetching audio from Blob URL...');
    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio from source: ${audioResponse.status} ${audioResponse.statusText} (URL: ${audioUrl})`);
    }
    if (!audioResponse.body) {
        throw new Error('Audio response body is missing');
    }

    // Get file size from headers if available, otherwise read the blob
    const contentLength = audioResponse.headers.get('content-length');
    let fileSize: number;
    let audioBlob: Blob;

    if (contentLength) {
      fileSize = parseInt(contentLength, 10);
      console.log(`📄 Audio file size from header: ${formatBytes(fileSize)}`);
      // Check size against Whisper limit *before* reading the full blob if possible
      if (fileSize > WHISPER_MAX_SIZE_BYTES) {
        throw new Error(`Audio file (${formatBytes(fileSize)}) exceeds Whisper API limit (${formatBytes(WHISPER_MAX_SIZE_BYTES)}). Please use segmented transcription.`);
      }
      audioBlob = await audioResponse.blob();
    } else {
      // If no content-length, read the blob to get the size
      audioBlob = await audioResponse.blob();
      fileSize = audioBlob.size;
      console.warn(`⚠️ Content-Length header missing. Read blob size: ${formatBytes(fileSize)}`);
      if (fileSize > WHISPER_MAX_SIZE_BYTES) {
        throw new Error(`Audio file (${formatBytes(fileSize)}) exceeds Whisper API limit (${formatBytes(WHISPER_MAX_SIZE_BYTES)}). Please use segmented transcription.`);
      }
    }

    console.log('✅ Audio fetched successfully from source.');

    // 2. Prepare the file for OpenAI SDK
    // Extract a filename from the URL for OpenAI, fallback to a default
    let filename = 'audio_from_url.tmp'; // Default filename
    try {
        const urlPath = new URL(audioUrl).pathname;
        const lastSegment = urlPath.split('/').pop();
        if (lastSegment) {
            // Basic sanitization and ensure it has an extension
             filename = lastSegment.replace(/[^a-zA-Z0-9_.-]/g, '_');
             if (!filename.includes('.')) filename += '.mp3'; // Assume mp3 if missing
        }
    } catch(nameError) {
        console.warn("Could not determine filename from URL, using default.", nameError);
    }

    // Create a File-like object for OpenAI
    const audioFile = new File([audioBlob], filename, { type: audioBlob.type || 'audio/mpeg' });

    console.log(`🤖 Sending audio (${filename}, size: ${formatBytes(audioFile.size)}) to OpenAI Whisper (${modelId})...`);

    // 3. Transcribe using OpenAI Whisper API
    const transcriptionOptions: any = {
      file: audioFile,
      model: modelId,
      language: language, // Use detected language or default
      response_format: 'text', // Get plain text
    };

    if (prompt) {
        transcriptionOptions.prompt = prompt;
    }

    // Call OpenAI API
    const transcriptionResult = await openai.audio.transcriptions.create(transcriptionOptions);

    // --- Debugging: Log the raw result ---
    console.log('🔍 Raw OpenAI Transcription Result:', transcriptionResult);
    // --- End Debugging ---

    // Safely access the transcription text
    // The result for response_format: 'text' is directly the string based on current behavior/docs
    // However, we add checks for robustness in case the SDK changes or returns an object unexpectedly.
    const transcription = (typeof transcriptionResult === 'string')
                           ? transcriptionResult // If API directly returns string
                           : (transcriptionResult as any)?.text; // Fallback: Access .text property if it's an object

    if (typeof transcription === 'string') {
      console.log(`✅ Transcription received from OpenAI (${transcription.length} characters).`);

      // 4. Return the transcription text
      return NextResponse.json({
          success: true,
          transcription: transcription
      });
    } else {
      // Handle failure to extract string
      console.error('❌ Failed to extract transcription string from OpenAI response:', transcriptionResult);
      throw new Error('Failed to extract transcription string from OpenAI API response.');
    }

  } catch (error: any) {
    // --- Debugging: Log detailed error info ---
    console.error('❌ Error during transcription process:', error);
    if (error instanceof Error) {
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
    }
    if (error.response) { // Axios-like error structure
        console.error('Error Response Status:', error.response.status);
        console.error('Error Response Data:', error.response.data);
    } else if (error.status) { // OpenAI SDK v4 error structure
        console.error('Error Status:', error.status);
        console.error('Error Details:', error.error);
    }
    // --- End Debugging ---

    let errorMessage = 'Failed to transcribe audio';
    let statusCode = 500;

    if (error.response || error.status) { // Handle OpenAI SDK v4 error structure
      const status = error.status || error.response?.status;
      const errorData = error.error || error.response?.data?.error;
      console.error(`OpenAI API Error (${status}):`, errorData);
      errorMessage = `OpenAI API Error (${status}): ${errorData?.message || 'Unknown OpenAI error'}`;
      statusCode = status || 500;
    } else if (error.message?.includes('Failed to fetch')) {
        // Error fetching from Blob/URL
        errorMessage = error.message;
        statusCode = 502; // Bad Gateway or service unavailable
    } else if (error.message?.includes('exceeds Whisper API limit')) {
        errorMessage = error.message;
        statusCode = 413; // Payload Too Large (specific to Whisper limit)
    } else {
      // Other errors
      errorMessage = error.message || 'An unknown error occurred during transcription.';
    }

    // Ensure consistent error response format
    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}
