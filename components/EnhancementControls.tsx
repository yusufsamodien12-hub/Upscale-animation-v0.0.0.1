import React, { useState, useMemo } from 'react';

interface EnhancementControlsProps {
  duration: number;
  onStart: (startTime: number, endTime: number, fps: number, useSmartEnhancement: boolean) => void;
}

export const EnhancementControls: React.FC<EnhancementControlsProps> = ({ duration, onStart }) => {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(Math.min(duration, 5)); // Default to 5s or less
  const [fps, setFps] = useState(24);
  const [useSmartEnhancement, setUseSmartEnhancement] = useState(false);

  const totalFrames = useMemo(() => {
    if (endTime > startTime && fps > 0) {
      return Math.floor((endTime - startTime) * fps);
    }
    return 0;
  }, [startTime, endTime, fps]);

  const handleStartClick = () => {
    onStart(startTime, endTime, fps, useSmartEnhancement);
  };

  return (
    <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-700 flex flex-col gap-6">
      <div className="text-center">
        <h3 className="text-xl font-bold text-indigo-300">Enhancement Settings</h3>
        <p className="text-sm text-gray-400 mt-1">Define the segment of the video you want to enhance.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="start-time" className="block text-sm font-medium text-gray-300 mb-1">Start Time (s)</label>
          <input
            type="number"
            id="start-time"
            value={startTime}
            onChange={(e) => setStartTime(Math.max(0, parseFloat(e.target.value)))}
            min="0"
            max={duration}
            step="0.1"
            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="end-time" className="block text-sm font-medium text-gray-300 mb-1">End Time (s)</label>
          <input
            type="number"
            id="end-time"
            value={endTime}
            onChange={(e) => setEndTime(Math.min(duration, parseFloat(e.target.value)))}
            min="0"
            max={duration}
            step="0.1"
            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="fps" className="block text-sm font-medium text-gray-300 mb-1">Frames Per Second (FPS)</label>
          <input
            type="number"
            id="fps"
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value, 10) || 1)}
            min="1"
            max="60"
            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

       <div className="relative flex items-start justify-center">
        <div className="flex h-6 items-center">
          <input
            id="smart-enhancement"
            aria-describedby="smart-enhancement-description"
            name="smart-enhancement"
            type="checkbox"
            checked={useSmartEnhancement}
            onChange={(e) => setUseSmartEnhancement(e.target.checked)}
            className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-600"
          />
        </div>
        <div className="ml-3 text-sm leading-6">
          <label htmlFor="smart-enhancement" className="font-medium text-gray-200">
            Enable Smart Enhancement
          </label>
          <p id="smart-enhancement-description" className="text-gray-400 text-xs">
            Uses a second AI to analyze each frame for better context. (Slower, higher quality)
          </p>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-md text-center">
        <p className="text-lg font-semibold text-gray-200">
          Total Frames to Process: <span className="text-indigo-400 font-bold">{totalFrames}</span>
        </p>
        {totalFrames > 120 && (
            <p className="text-xs text-yellow-400 mt-2">
                Warning: Processing a large number of frames can take a very long time. We recommend starting with a short (1-2 second) clip.
            </p>
        )}
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleStartClick}
          disabled={totalFrames <= 0}
          className="w-full sm:w-1/2 md:w-1/3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out text-lg shadow-lg"
        >
          ✨ Start Enhancement
        </button>
      </div>
    </div>
  );
};