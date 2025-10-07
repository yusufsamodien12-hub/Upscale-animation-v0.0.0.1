import React from 'react';

interface VideoDisplayProps {
  title: string;
  videoUrl: string | null;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

export const VideoDisplay: React.FC<VideoDisplayProps> = ({ title, videoUrl, videoRef }) => {
  if (!videoUrl) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-200">{title}</h2>
      </div>
      <video
        ref={videoRef}
        controls
        src={videoUrl}
        className="w-full rounded-lg bg-black aspect-video shadow-lg"
      />
    </div>
  );
};
