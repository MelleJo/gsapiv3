import { NextResponse } from 'next/server';
import openai from '../../../lib/openai';
import * as audioChunker from '../../../lib/audioChunker';

/**
 * Handles audio transcription and summarization.
 * 
 * - Uses gpt-4o-transcribe (or gpt-4o-mini-transcribe for streaming) to transcribe audio.
 * - If the uploaded audio file exceeds 25MB, it is split into chunks using the audioChunker utilities.
 * - Supports streaming transcription if the "stream" form field is set to "true".
 * - After transcription, a summarization request is sent to GPT-4O.
 */
export async function POST(request: Request) {
  try {
    // Remove Content-Type check to allow requests without multipart/form-data header.
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    // Determine if streaming is requested (expects string "true")
    const streamParam = formData.get('stream')?.toString() === 'true';
    let fullTranscript = "";

    // Function to process transcription for a single audio (or chunk)
    const processTranscription = async (audio: File | Blob): Promise<string> => {
      // Use "gpt-4o-mini-transcribe" for streaming; use "gpt-4o-transcribe" otherwise.
      const model = streamParam ? "gpt-4o-mini-transcribe" : "gpt-4o-transcribe";
      const params: any = {
        file: audio,
        model,
        response_format: "text",
        stream: streamParam,
      };

      if (streamParam) {
        let transcriptChunk = "";
        // The create call returns an async iterable stream.
        const streamResponse = await openai.audio.transcriptions.create(params);
        // Cast to unknown then to AsyncIterable<any> to satisfy TypeScript.
        for await (const event of (streamResponse as unknown as AsyncIterable<any>)) {
          if (event.type === 'transcript.text.delta' && event.text) {
            transcriptChunk += event.text;
          }
          // Accumulate delta texts until the stream is complete.
        }
        return transcriptChunk;
      } else {
        const response = await openai.audio.transcriptions.create(params);
        return response.text;
      }
    };

    // Define maximum size for a single request (25 MB).
    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      // If file exceeds 25 MB, split it into chunks.
      const chunks = await audioChunker.splitAudioBlob(file);
      for (const chunk of chunks) {
        const chunkTranscript = await processTranscription(chunk);
        fullTranscript += chunkTranscript + "\n";
      }
    } else {
      fullTranscript = await processTranscription(file);
    }

    // Summarization: Use GPT-4O to summarize the complete transcript.
    const summaryMessages: any[] = [
      { role: "system", content: "You are a meeting summarizer. Summarize the transcript provided." },
      {
        role: "user",
        content: `Transcript:\n\n${fullTranscript}\n\nPlease provide a concise summary.`
      }
    ];
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: summaryMessages,
      temperature: 0.5,
    });
    const summary = chatResponse.choices[0].message.content || "";

    return NextResponse.json({ transcript: fullTranscript, summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "An error occurred." }, { status: 500 });
  }
}
