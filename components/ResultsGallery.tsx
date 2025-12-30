import React from 'react';
import type { EnhancedFrameData } from '../App';

interface ResultsGalleryProps {
  frames: EnhancedFrameData[];
  isComplete: boolean;
  totalFrames: number;
  onDownloadZip: () => void;
  isZipping: boolean;
  onGenerateWithVeo: (frame: EnhancedFrameData) => void;
}

export const ResultsGallery: React.FC<ResultsGalleryProps> = ({ frames, isComplete, totalFrames, onDownloadZip, isZipping, onGenerateWithVeo }) => {
  const successfulFramesCount = frames.filter(f => f.enhanced).length;

  const getIconForMethod = (method: string) => {
    if (method.includes('Smart')) return '🧠';
    if (method.includes('Normal')) return '⚡️';
    if (method.includes('Direct')) return '🎯';
    return '';
  };

  const getBgColorForMethod = (method: string) => {
    if (method.includes('Fallback') || method.includes('Last Resort')) {
      return 'bg-orange-600/80';
    }
    return 'bg-indigo-600/80';
  };

  return (
    <div className="w-full mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <h3 className="text-xl font-bold text-indigo-300">Enhancement Progress</h3>
        <p className="font-mono text-lg bg-gray-800 px-3 py-1 rounded-md">{frames.length} / {totalFrames} Frames Attempted</p>
      </div>

      {isComplete && (
        <div className="bg-green-900/50 border border-green-700 text-green-200 p-4 rounded-lg mb-6 text-center">
          <h4 className="font-bold text-lg">Processing Complete!</h4>
          <p className="mt-2">{successfulFramesCount} of {totalFrames} frames were enhanced successfully.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={onDownloadZip}
            disabled={isZipping || successfulFramesCount === 0}
            className="mt-4 inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300"
          >
            {isZipping ? 'Zipping...' : `📦 Download ${successfulFramesCount} Frames as .ZIP`}
          </button>
          {/* Video creation UI removed — user requested no in-browser video compilation */}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {frames.slice().reverse().map(frame => (
          <div
            key={frame.frameNumber}
            className={`relative group aspect-video bg-gray-800 rounded-md overflow-hidden transition-all ${frame.error ? 'border-2 border-red-500' : ''}`}
            title={frame.error ? `Error: ${frame.error}` : `Enhanced frame ${frame.frameNumber}`}
          >
            {frame.enhanced ? (
              <>
                <img
                  src={`data:image/jpeg;base64,${frame.enhanced}`}
                  alt={`Enhanced frame ${frame.frameNumber}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <button 
                        onClick={() => onGenerateWithVeo(frame)}
                        className="text-white text-3xl p-3 bg-indigo-600/50 rounded-full hover:bg-indigo-500/80 transition-all"
                        title="Generate a new scene with this frame"
                    >
                        🎬
                    </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full p-2 text-center text-red-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs font-semibold">Failed</span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 bg-black/70 text-white px-2 py-0.5 text-xs font-mono rounded-tr-md">
              #{String(frame.frameNumber).padStart(4, '0')}
            </div>
            {frame.enhanced && frame.method && (
              <div
                className={`absolute top-0 right-0 text-white px-1.5 py-0.5 text-lg font-semibold rounded-bl-md ${getBgColorForMethod(frame.method)}`}
                title={`Enhanced with: ${frame.method}`}
              >
                {getIconForMethod(frame.method)}
              </div>
            )}
          </div>
        ))}
      </div>

      {isComplete && (
        <div className="mt-8 border-t border-gray-700 pt-6">
            <h4 className="text-lg font-bold text-yellow-300 mb-3">Next Steps: Re-assemble Your Video</h4>
            <div className="text-sm text-gray-300 space-y-4 bg-gray-800/50 p-4 rounded-md">
                <p>You have downloaded an image sequence. To turn it back into a video, you need to use a video editor. Here's a general guide:</p>
                <ol className="list-decimal list-inside space-y-2">
                    <li><strong>Unzip the File:</strong> Extract all the `frame_XXXXX.jpg` files into a folder.</li>
                    <li><strong>Import Image Sequence:</strong> Open a video editor (like DaVinci Resolve, Adobe Premiere, etc.) and import the images as an "Image Sequence". Make sure to set the frame rate (FPS) to the same value you used for enhancement.</li>
                    <li><strong>Add Original Audio:</strong> Import your original video file into the editor and place it on the audio track, lined up with your new enhanced video track.</li>
                    <li><strong>Export:</strong> Export your project as a new video file (e.g., MP4).</li>
                </ol>
                <p className="mt-3">For command-line users, <strong className="text-yellow-400">FFMPEG</strong> is a powerful free tool for this. A typical command would look something like this: <br /> <code className="block bg-gray-900 p-2 rounded-md text-xs mt-1 font-mono">ffmpeg -framerate 24 -i frame_%05d.jpg -i original_video.mp4 -c:v libx264 -pix_fmt yuv420p -c:a copy -shortest output.mp4</code></p>
            </div>
        </div>
      )}
    </div>
  );
};