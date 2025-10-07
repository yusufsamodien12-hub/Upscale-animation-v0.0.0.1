// This utility encapsulates browser-based logic for processing a video file on the client-side.

interface VideoMetadata {
  duration: number;
}

/**
 * Loads a video file just enough to read its metadata, primarily the duration.
 * @param videoFile The video file.
 * @returns A promise that resolves with the video's metadata.
 */
export const getVideoMetadata = (videoFile: File): Promise<VideoMetadata> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;

    video.onloadedmetadata = () => {
      resolve({ duration: video.duration });
      URL.revokeObjectURL(videoUrl);
      video.remove();
    };

    video.onerror = () => {
      reject(new Error('Failed to load video metadata. The file may be corrupt or unsupported.'));
      URL.revokeObjectURL(videoUrl);
      video.remove();
    };
  });
};

/**
 * Extracts a single frame from a video file at a specific time with improved robustness.
 * Includes a timeout to prevent hanging on problematic video files.
 * @param videoFile The video file to process.
 * @param time The time in seconds to capture the frame from.
 * @returns A promise that resolves with the base64-encoded image data.
 */
export const extractFrameAtTime = (videoFile: File, time: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    let video = document.createElement('video');
    video.autoplay = false;
    video.muted = true;
    video.preload = 'auto';

    let videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;

    let timeoutId: number | null = null;

    // Centralized cleanup function to prevent memory leaks
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (video) {
        // Remove listeners to be safe
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        video.remove();
        video = null!;
      }
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
        videoUrl = null!;
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error('Error processing video. The file may be corrupt or the format unsupported.'));
    };

    const onSeeked = () => {
      // Use requestAnimationFrame to ensure the frame is ready to be drawn to the canvas
      requestAnimationFrame(() => {
        if (!video) {
          // Can happen if cleanup was already called by a timeout
          return;
        }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx || canvas.width === 0 || canvas.height === 0) {
            cleanup();
            return reject(new Error('Could not get canvas context or video dimensions are zero.'));
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          const base64 = dataUrl.split(',')[1];

          if (!base64) {
            cleanup();
            return reject(new Error('Failed to encode canvas to Base64.'));
          }

          cleanup();
          resolve(base64);
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error('An unexpected error occurred during frame capture.'));
        }
      });
    };

    // Set a timeout to prevent the process from hanging indefinitely
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Frame extraction timed out after 10 seconds for time: ${time.toFixed(2)}s`));
    }, 10000); // 10-second timeout

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });

    // This triggers the whole process
    video.currentTime = time;
  });
};