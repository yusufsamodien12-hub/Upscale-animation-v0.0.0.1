import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="text-center">
      <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
        AI Animation Sequence Enhancer
      </h1>
      <p className="mt-3 text-lg text-gray-300 max-w-3xl mx-auto">
        Automate the upscaling of old animations. Select a portion of your video, and the AI will enhance it frame-by-frame. Download the resulting image sequence to assemble your high-quality video.
      </p>
    </header>
  );
};