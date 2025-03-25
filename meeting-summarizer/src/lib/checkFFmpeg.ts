import ffmpeg from 'fluent-ffmpeg';

export function checkFFmpegInstallation(): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableCodecs((err, codecs) => {
      if (err) {
        reject(new Error('FFmpeg is not installed or not accessible. Please install FFmpeg to enable audio file conversion.'));
        return;
      }
      
      // Check if MP3 encoding is available (libmp3lame)
      if (!codecs?.['libmp3lame']) {
        reject(new Error('FFmpeg MP3 encoder (libmp3lame) is not available. Please install the MP3 codec.'));
        return;
      }
      
      resolve();
    });
  });
}
