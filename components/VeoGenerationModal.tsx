import React, { useState } from 'react';
import type { EnhancedFrameData } from '../App';
import { Loader } from './Loader';

interface VeoGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  frameData: EnhancedFrameData;
  onGenerate: (prompt: string) => void;
  generationState: 'idle' | 'loading' | 'success' | 'error';
  generatedVideoUrl: string | null;
  error: string | null;
}

export const VeoGenerationModal: React.FC<VeoGenerationModalProps> = ({
  isOpen,
  onClose,
  frameData,
  onGenerate,
  generationState,
  generatedVideoUrl,
  error,
}) => {
  const [prompt, setPrompt] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleGenerateClick = () => {
    if (prompt.trim()) {
      onGenerate(prompt);
    }
  };

  const loadingMessages = [
    "Initializing generation...",
    "AI is warming up its creative circuits...",
    "Crafting your animated scene...",
    "This can take a few minutes, please be patient.",
    "The AI is rendering the video now...",
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-indigo-300">🎬 AI Scene Generator (Powered by Veo)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </header>

        <div className="p-6 overflow-y-auto">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/2 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-300 mb-2">Reference Frame #{frameData.frameNumber}</p>
              {frameData.enhanced && (
                <img
                  src={`data:image/jpeg;base64,${frameData.enhanced}`}
                  alt={`Reference frame ${frameData.frameNumber}`}
                  className="rounded-lg aspect-video object-cover w-full"
                />
              )}
            </div>
            <div className="w-full md:w-1/2 flex flex-col justify-center">
              {generationState === 'idle' && (
                <>
                  <div>
                    <label htmlFor="veo-prompt" className="block text-sm font-medium text-gray-300 mb-1">
                      Describe the scene you want to create:
                    </label>
                    <textarea
                      id="veo-prompt"
                      rows={4}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., The character waves at the camera"
                      className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={handleGenerateClick}
                    disabled={!prompt.trim()}
                    className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    Generate Video
                  </button>
                </>
              )}
              {generationState === 'loading' && (
                 <Loader message={loadingMessages[Math.floor(Math.random() * loadingMessages.length)]} />
              )}
              {generationState === 'success' && generatedVideoUrl && (
                <div className="text-center">
                    <h3 className="text-lg font-bold text-green-400 mb-3">Scene Generated Successfully!</h3>
                    <video src={generatedVideoUrl} controls autoPlay className="w-full rounded-lg aspect-video" />
                     <a
                        href={generatedVideoUrl}
                        download={`veo_scene_${frameData.frameNumber}.mp4`}
                        className="mt-4 inline-block w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                        Download Video
                    </a>
                </div>
              )}
              {generationState === 'error' && (
                <div className="text-center p-4 bg-red-900/50 rounded-lg">
                    <h3 className="text-lg font-bold text-red-400 mb-2">Generation Failed</h3>
                    <p className="text-red-300 text-sm">{error}</p>
                    <button onClick={() => onGenerate(prompt)} className="mt-4 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg">
                        Retry
                    </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
