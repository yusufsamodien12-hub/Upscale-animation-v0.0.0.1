import React, { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { VideoDisplay } from './components/VideoDisplay';
import { Loader } from './components/Loader';
import { ResultsGallery } from './components/ResultsGallery';
import { EnhancementControls } from './components/EnhancementControls';
import { VeoGenerationModal } from './components/VeoGenerationModal';
import { enhanceFrame, generateVideoWithVeo } from './services/geminiService';
import { extractFrameAtTime, getVideoMetadata } from './utils/fileUtils';

export interface EnhancedFrameData {
  frameNumber: number;
  original: string; // The base64 of the original frame
  enhanced?: string; // The base64 of the enhanced frame, undefined on failure
  error?: string; // The error message, undefined on success
  method?: string; // e.g. 'Smart', 'Normal (Fallback)'
}

const CONCURRENCY_LIMIT = 8; // Process 8 frames in parallel

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ duration: number; } | null>(null);
  
  const [enhancedFrames, setEnhancedFrames] = useState<EnhancedFrameData[]>([]);
  const [totalFramesToProcess, setTotalFramesToProcess] = useState(0);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // State for Veo Generation Modal
  const [isVeoModalOpen, setIsVeoModalOpen] = useState(false);
  const [selectedFrameForVeo, setSelectedFrameForVeo] = useState<EnhancedFrameData | null>(null);
  const [veoGenerationState, setVeoGenerationState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [veoError, setVeoError] = useState<string | null>(null);


  const videoRef = useRef<HTMLVideoElement>(null);
  const isCancelledRef = useRef(false);

  const resetState = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setEnhancedFrames([]);
    setTotalFramesToProcess(0);
    setIsProcessing(false);
    setIsZipping(false);
    setError(null);
    isCancelledRef.current = false;
  };

  const handleFileChange = useCallback(async (file: File | null) => {
    if (file) {
      resetState();
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      
      try {
        const metadata = await getVideoMetadata(file);
        setVideoMetadata(metadata);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process video metadata.');
      }
    }
  }, []);
  
  const handleStartEnhancement = async (startTime: number, endTime: number, fps: number, useSmartEnhancement: boolean) => {
    if (!videoFile || !videoMetadata || startTime >= endTime || fps <= 0) {
      setError("Invalid settings. Please check your start/end times and FPS.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setEnhancedFrames([]);
    isCancelledRef.current = false;

    const duration = endTime - startTime;
    const totalFrames = Math.floor(duration * fps);
    setTotalFramesToProcess(totalFrames);

    const tasks: { frameNumber: number; time: number }[] = [];
    for (let i = 0; i < totalFrames; i++) {
        tasks.push({
            frameNumber: i + 1,
            time: startTime + (i / fps),
        });
    }

    const processTask = async (task: { frameNumber: number; time: number }, initialUseSmartEnhancement: boolean) => {
      if (isCancelledRef.current) return;
      let frameBase64 = '';
      try {
          frameBase64 = await extractFrameAtTime(videoFile, task.time);
          if (isCancelledRef.current) return;
      } catch (extractionError) {
          const message = extractionError instanceof Error ? extractionError.message : 'An unknown error occurred during frame extraction.';
          console.error(`Failed to extract frame ${task.frameNumber}. Error: ${message}`);
          setEnhancedFrames(prev => [...prev, {
              frameNumber: task.frameNumber,
              original: '',
              error: message
          }].sort((a, b) => a.frameNumber - b.frameNumber));
          return;
      }
  
      const initialMethod = initialUseSmartEnhancement ? 'smart' : 'normal';
      const fallbackMethod = initialUseSmartEnhancement ? 'normal' : 'smart';
      const lastResortMethod = 'direct';
      const errorMessages: string[] = [];
  
      // Attempt 1: Initial Method
      try {
          const enhancedBase64 = await enhanceFrame(frameBase64, initialMethod);
          if (isCancelledRef.current) return;
          setEnhancedFrames(prev => [...prev, {
              frameNumber: task.frameNumber, original: frameBase64, enhanced: enhancedBase64,
              method: initialUseSmartEnhancement ? 'Smart' : 'Normal',
          }].sort((a, b) => a.frameNumber - b.frameNumber));
          return;
      } catch (error) {
          console.warn(`Initial method '${initialMethod}' failed for frame ${task.frameNumber}. Retrying...`, error);
          errorMessages.push(`Attempt 1 (${initialMethod}) failed: ${(error as Error).message}`);
      }
  
      if (isCancelledRef.current) return;
  
      // Attempt 2: Fallback Method
      try {
          const enhancedBase64 = await enhanceFrame(frameBase64, fallbackMethod);
          if (isCancelledRef.current) return;
          setEnhancedFrames(prev => [...prev, {
              frameNumber: task.frameNumber, original: frameBase64, enhanced: enhancedBase64,
              method: `${fallbackMethod === 'smart' ? 'Smart' : 'Normal'} (Fallback)`,
          }].sort((a, b) => a.frameNumber - b.frameNumber));
          return;
      } catch (error) {
          console.warn(`Fallback method '${fallbackMethod}' failed for frame ${task.frameNumber}. Retrying...`, error);
          errorMessages.push(`Attempt 2 (${fallbackMethod}) failed: ${(error as Error).message}`);
      }
      
      if (isCancelledRef.current) return;
  
      // Attempt 3: Last Resort Method
      try {
          const enhancedBase64 = await enhanceFrame(frameBase64, lastResortMethod);
          if (isCancelledRef.current) return;
          setEnhancedFrames(prev => [...prev, {
              frameNumber: task.frameNumber, original: frameBase64, enhanced: enhancedBase64,
              method: 'Direct (Last Resort)',
          }].sort((a, b) => a.frameNumber - b.frameNumber));
          return;
      } catch (error) {
          console.warn(`Last resort method '${lastResortMethod}' failed for frame ${task.frameNumber}.`, error);
          errorMessages.push(`Attempt 3 (${lastResortMethod}) failed: ${(error as Error).message}`);
      }
  
      // All attempts failed
      const finalMessage = errorMessages.join(' | ');
      console.error(`All enhancement methods failed for frame ${task.frameNumber}. Errors: ${finalMessage}`);
      setEnhancedFrames(prev => [...prev, {
          frameNumber: task.frameNumber,
          original: frameBase64,
          error: finalMessage
      }].sort((a, b) => a.frameNumber - b.frameNumber));
  };
    
    const workerPool = new Set<Promise<void>>();
    let taskIndex = 0;

    const fillPool = () => {
      if (isCancelledRef.current) return;
      while (workerPool.size < CONCURRENCY_LIMIT && taskIndex < tasks.length) {
        const task = tasks[taskIndex++];
        const promise = processTask(task, useSmartEnhancement).finally(() => {
          workerPool.delete(promise);
          fillPool();
        });
        workerPool.add(promise);
      }
    };

    fillPool();

    const checkCompletion = () => {
        if (workerPool.size === 0 && taskIndex === tasks.length) {
            setIsProcessing(false);
        } else if (!isCancelledRef.current) {
            setTimeout(checkCompletion, 100);
        }
    }
    checkCompletion();
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setIsProcessing(false);
  };

  const handleDownloadZip = async () => {
    const successfulFrames = enhancedFrames.filter(f => f.enhanced);
    if (successfulFrames.length === 0) return;
    setIsZipping(true);
    setError(null);

    try {
      const zip = new JSZip();
      successfulFrames.forEach(frame => {
        if (frame.enhanced) {
          const frameName = `frame_${String(frame.frameNumber).padStart(5, '0')}.jpg`;
          zip.file(frameName, frame.enhanced, { base64: true });
        }
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "enhanced-frames.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ZIP file.');
    } finally {
      setIsZipping(false);
    }
  };

  // Veo Modal Handlers
  const handleOpenVeoModal = (frame: EnhancedFrameData) => {
    setSelectedFrameForVeo(frame);
    setIsVeoModalOpen(true);
  };

  const handleCloseVeoModal = () => {
    setIsVeoModalOpen(false);
    setSelectedFrameForVeo(null);
    setVeoGenerationState('idle');
    setVeoError(null);
    if (generatedVideoUrl) {
      URL.revokeObjectURL(generatedVideoUrl);
      setGeneratedVideoUrl(null);
    }
  };

  const handleStartVeoGeneration = async (prompt: string) => {
    if (!selectedFrameForVeo?.enhanced) return;
    
    setVeoGenerationState('loading');
    setVeoError(null);
    if (generatedVideoUrl) URL.revokeObjectURL(generatedVideoUrl);
    setGeneratedVideoUrl(null);

    try {
      const videoBlobUrl = await generateVideoWithVeo(selectedFrameForVeo.enhanced, prompt);
      setGeneratedVideoUrl(videoBlobUrl);
      setVeoGenerationState('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred during video generation.";
      setVeoError(message);
      setVeoGenerationState('error');
    }
  };


  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-7xl">
        <Header />

        <main className="mt-8 bg-gray-800/50 p-6 rounded-2xl shadow-2xl backdrop-blur-sm border border-gray-700">
          {!videoFile && <FileUpload onFileSelect={handleFileChange} />}

          {videoUrl && (
             <div className="flex flex-col gap-8">
                <VideoDisplay title="Original Video" videoUrl={videoUrl} videoRef={videoRef} />

                {error && <p className="text-red-400 mt-2 p-3 bg-red-900/50 rounded-lg text-center">{error}</p>}
                
                {videoMetadata && !isProcessing && enhancedFrames.length === 0 && (
                  <EnhancementControls
                    duration={videoMetadata.duration}
                    onStart={handleStartEnhancement}
                  />
                )}
                
                {isProcessing && (
                  <div className="flex flex-col items-center gap-4">
                    <Loader message={`Processing... ${enhancedFrames.length} of ${totalFramesToProcess} frames complete.`} />
                     <button
                        onClick={handleCancel}
                        className="w-full sm:w-1/2 md:w-1/3 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out text-lg shadow-lg"
                    >
                       Cancel Process
                    </button>
                  </div>
                )}

                {enhancedFrames.length > 0 && (
                   <ResultsGallery 
                      frames={enhancedFrames} 
                      isComplete={!isProcessing}
                      totalFrames={totalFramesToProcess}
                      onDownloadZip={handleDownloadZip}
                      isZipping={isZipping}
                      onGenerateWithVeo={handleOpenVeoModal}
                   />
                )}
                
                { !isProcessing && videoFile && (
                   <div className="flex flex-col items-center gap-4 mt-8 border-t border-gray-700 pt-6">
                       <button
                          onClick={resetState}
                          className="w-full sm:w-auto bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300"
                      >
                          Enhance a Different Video
                      </button>
                   </div>
                 )}
             </div>
          )}
        </main>
      </div>

      {isVeoModalOpen && selectedFrameForVeo && (
        <VeoGenerationModal 
          isOpen={isVeoModalOpen}
          onClose={handleCloseVeoModal}
          frameData={selectedFrameForVeo}
          onGenerate={handleStartVeoGeneration}
          generationState={veoGenerationState}
          generatedVideoUrl={generatedVideoUrl}
          error={veoError}
        />
      )}
    </div>
  );
}