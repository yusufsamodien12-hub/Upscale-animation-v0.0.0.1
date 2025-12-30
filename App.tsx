import React, { useState, useCallback, useRef } from 'react';
import { useEffect } from 'react';
import JSZip from 'jszip';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { VideoDisplay } from './components/VideoDisplay';
import { Loader } from './components/Loader';
import { ResultsGallery } from './components/ResultsGallery';
import { EnhancementControls } from './components/EnhancementControls';
import { VeoGenerationModal } from './components/VeoGenerationModal';
import { enhanceFrame, generateVideoWithVeo, enhanceFrameNonAI } from './services/geminiService';
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
  const [extractedFrames, setExtractedFrames] = useState<EnhancedFrameData[]>([]);
  const [totalFramesToProcess, setTotalFramesToProcess] = useState(0);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionComplete, setExtractionComplete] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [enhancementProgress, setEnhancementProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFps, setLastFps] = useState<number>(24);
  const [isCreatingVideo, setIsCreatingVideo] = useState<boolean>(false);
  const [lastUseSmart, setLastUseSmart] = useState<boolean>(false);
  const [lastEngine, setLastEngine] = useState<'ai' | 'local'>('ai');
  const [lastTheme, setLastTheme] = useState<string>('none');

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

  // Global error handlers to catch unexpected crashes and show them in UI
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error || event.message);
      setError(event.error?.message || String(event.message));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled rejection:', event.reason);
      setError(event.reason instanceof Error ? event.reason.message : String(event.reason));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection as any);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection as any);
    };
  }, []);

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
  
  const handleStartEnhancement = async (startTime: number, endTime: number, fps: number, useSmartEnhancement: boolean, engine: 'ai' | 'local', theme?: string) => {
    if (!videoFile || !videoMetadata || startTime >= endTime || fps <= 0) {
      setError("Invalid settings. Please check your start/end times and FPS.");
      return;
    }
    // Start extraction-only phase
    setIsExtracting(true);
    setIsProcessing(false);
    setError(null);
    setEnhancedFrames([]);
    setExtractedFrames([]);
    isCancelledRef.current = false;

    const duration = endTime - startTime;
    const totalFrames = Math.floor(duration * fps);
    setTotalFramesToProcess(totalFrames);
    setExtractionProgress({ done: 0, total: totalFrames });
    setLastFps(fps);
    setLastUseSmart(useSmartEnhancement);
    setLastEngine(engine);
    setLastTheme(theme || 'none');

    const tasks: { frameNumber: number; time: number }[] = [];
    for (let i = 0; i < totalFrames; i++) {
        tasks.push({ frameNumber: i + 1, time: startTime + (i / fps) });
    }

    const tempExtracted: EnhancedFrameData[] = [];
    const extractPool = new Set<Promise<void>>();
    let extractIndex = 0;

    const extractWorker = async (task: { frameNumber: number; time: number }) => {
      if (isCancelledRef.current) return;
      try {
        const frameBase64 = await extractFrameAtTime(videoFile, task.time);
        if (isCancelledRef.current) return;
        tempExtracted.push({ frameNumber: task.frameNumber, original: frameBase64 });
        setExtractedFrames(prev => [...prev.filter(f => f.frameNumber !== task.frameNumber), { frameNumber: task.frameNumber, original: frameBase64 }].sort((a, b) => a.frameNumber - b.frameNumber));
        setExtractionProgress(p => ({ done: p.done + 1, total: totalFrames }));
      } catch (extractionError) {
        const message = extractionError instanceof Error ? extractionError.message : 'An unknown error occurred during frame extraction.';
        console.error(`Failed to extract frame ${task.frameNumber}. Error: ${message}`);
        tempExtracted.push({ frameNumber: task.frameNumber, original: '', error: message });
        setExtractedFrames(prev => [...prev.filter(f => f.frameNumber !== task.frameNumber), { frameNumber: task.frameNumber, original: '', error: message }].sort((a, b) => a.frameNumber - b.frameNumber));
        setExtractionProgress(p => ({ done: p.done + 1, total: totalFrames }));
      }
    };

    const fillExtractPool = () => {
      if (isCancelledRef.current) return;
      while (extractPool.size < CONCURRENCY_LIMIT && extractIndex < tasks.length) {
        const task = tasks[extractIndex++];
        const p = extractWorker(task).finally(() => {
          extractPool.delete(p);
          fillExtractPool();
        });
        extractPool.add(p);
      }
    };

    fillExtractPool();

    const waitForExtraction = () => new Promise<void>((resolve) => {
      const check = () => {
        if (extractPool.size === 0 && extractIndex === tasks.length) return resolve();
        if (isCancelledRef.current) return resolve();
        setTimeout(check, 100);
      };
      check();
    });

    await waitForExtraction();

    setIsExtracting(false);
    setExtractionComplete(true);
    setExtractedFrames(tempExtracted.slice().sort((a, b) => a.frameNumber - b.frameNumber));
    setExtractionProgress({ done: extractionProgress.total, total: extractionProgress.total });
  };

  // Video creation removed to avoid UI blanking — user requested no in-browser video compilers.

  // MP4/WebM creation handlers removed per user request to avoid blanking.

  // Video 'produce both' removed.

  const handleBeginEnhancement = async (useSmartEnhancement: boolean, engine: 'ai' | 'local', theme?: string) => {
    if (isCancelledRef.current) return;
    if (extractedFrames.length === 0) return;

    setIsProcessing(true);
    setError(null);
    isCancelledRef.current = false;

    const framesToEnhance = extractedFrames.slice().sort((a, b) => a.frameNumber - b.frameNumber);
    setEnhancementProgress({ done: 0, total: framesToEnhance.length });

    const updateFrame = (frameNumber: number, patch: Partial<EnhancedFrameData>) => {
      setEnhancedFrames(prev => {
        // ensure we keep original data if present
        const found = prev.find(f => f.frameNumber === frameNumber);
        if (found) {
          return prev.map(f => f.frameNumber === frameNumber ? { ...f, ...patch } : f).sort((a, b) => a.frameNumber - b.frameNumber);
        }
        return [...prev, { frameNumber, original: framesToEnhance.find(x => x.frameNumber === frameNumber)?.original || '', ...patch }].sort((a, b) => a.frameNumber - b.frameNumber);
      });
    };

    const enhanceWorker = async (frameItem: EnhancedFrameData) => {
      if (isCancelledRef.current) return;
      const frameBase64 = frameItem.original;
      if (!frameBase64) return; // extraction failed already recorded

      const initialMethod = useSmartEnhancement ? 'smart' : 'normal';
      const fallbackMethod = useSmartEnhancement ? 'normal' : 'smart';
      const lastResortMethod = 'direct';
      const useLocal = engine === 'local';
      const errors: string[] = [];

      if (useLocal) {
        try {
            const enhancedBase64 = await enhanceFrameNonAI(frameBase64, { theme: theme || lastTheme });
          if (isCancelledRef.current) return;
          updateFrame(frameItem.frameNumber, { enhanced: enhancedBase64, method: 'Local (Not AI)' });
          setEnhancementProgress(p => ({ done: p.done + 1, total: p.total }));
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Local enhancement failed.';
          console.warn(`Local enhancement failed for frame ${frameItem.frameNumber}:`, message);
          errors.push(`Local enhancement failed: ${message}`);
        }
      }

      try {
        const enhancedBase64 = await enhanceFrame(frameBase64, initialMethod);
        if (isCancelledRef.current) return;
        updateFrame(frameItem.frameNumber, { enhanced: enhancedBase64, method: useSmartEnhancement ? 'Smart' : 'Normal' });
        setEnhancementProgress(p => ({ done: p.done + 1, total: p.total }));
        return;
      } catch (err) {
        errors.push(`Attempt 1 (${initialMethod}) failed: ${(err as Error).message}`);
      }

      if (isCancelledRef.current) return;

      try {
        const enhancedBase64 = await enhanceFrame(frameBase64, fallbackMethod);
        if (isCancelledRef.current) return;
        updateFrame(frameItem.frameNumber, { enhanced: enhancedBase64, method: `${fallbackMethod === 'smart' ? 'Smart' : 'Normal'} (Fallback)` });
        return;
      } catch (err) {
        errors.push(`Attempt 2 (${fallbackMethod}) failed: ${(err as Error).message}`);
      }

      if (isCancelledRef.current) return;

      try {
        const enhancedBase64 = await enhanceFrame(frameBase64, lastResortMethod);
        if (isCancelledRef.current) return;
        updateFrame(frameItem.frameNumber, { enhanced: enhancedBase64, method: 'Direct (Last Resort)' });
        setEnhancementProgress(p => ({ done: p.done + 1, total: p.total }));
        return;
      } catch (err) {
        errors.push(`Attempt 3 (${lastResortMethod}) failed: ${(err as Error).message}`);
      }

      const finalMessage = errors.join(' | ');
      console.error(`All enhancement methods failed for frame ${frameItem.frameNumber}. Errors: ${finalMessage}`);
      updateFrame(frameItem.frameNumber, { error: finalMessage });
      setEnhancementProgress(p => ({ done: p.done + 1, total: p.total }));
    };

    const enhancePool = new Set<Promise<void>>();
    let enhanceIndex = 0;

    const fillEnhancePool = () => {
      if (isCancelledRef.current) return;
      while (enhancePool.size < CONCURRENCY_LIMIT && enhanceIndex < framesToEnhance.length) {
        const frameItem = framesToEnhance[enhanceIndex++];
        const p = enhanceWorker(frameItem).finally(() => {
          enhancePool.delete(p);
          fillEnhancePool();
        });
        enhancePool.add(p);
      }
    };

    fillEnhancePool();

    const waitForEnhancements = () => new Promise<void>((resolve) => {
      const check = () => {
        if (enhancePool.size === 0 && enhanceIndex === framesToEnhance.length) return resolve();
        if (isCancelledRef.current) return resolve();
        setTimeout(check, 100);
      };
      check();
    });

    await waitForEnhancements();

    setIsProcessing(false);
    setExtractionComplete(false);
    setExtractedFrames([]);
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
                
                {videoMetadata && !isProcessing && !isExtracting && !extractionComplete && enhancedFrames.length === 0 && (
                  <EnhancementControls
                    duration={videoMetadata.duration}
                    onStart={handleStartEnhancement}
                  />
                )}

                {isExtracting && (
                  <div className="flex flex-col items-center gap-4">
                    <Loader message={`Extracting frames... ${extractedFrames.length} of ${totalFramesToProcess} frames extracted.`} />
                    <button
                      onClick={() => { isCancelledRef.current = true; setIsExtracting(false); setExtractionComplete(false); }}
                      className="w-full sm:w-1/2 md:w-1/3 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out text-lg shadow-lg"
                    >
                      Cancel Extraction
                    </button>
                  </div>
                )}

                {extractionComplete && !isProcessing && (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-green-300">Frame extraction complete. {extractedFrames.length} frames saved in memory.</p>
                    <div className="flex gap-3 w-full sm:w-1/2 md:w-1/3">
                      <button
                        onClick={async () => {
                          // allow user to download extracted frames as zip
                          setIsZipping(true);
                          try {
                            const zip = new JSZip();
                            extractedFrames.forEach(frame => {
                              if (frame.original) {
                                const frameName = `frame_${String(frame.frameNumber).padStart(5, '0')}.jpg`;
                                zip.file(frameName, frame.original, { base64: true });
                              }
                            });
                            const blob = await zip.generateAsync({ type: 'blob' });
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = 'extracted-frames.zip';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(link.href);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to create ZIP file.');
                          } finally {
                            setIsZipping(false);
                          }
                        }}
                        className="w-1/2 bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg"
                      >
                        📥 Download Extracted Frames
                      </button>

                      <button
                        onClick={() => { setExtractionComplete(false); handleBeginEnhancement(lastUseSmart, lastEngine, lastTheme); }}
                        className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg"
                      >
                        ▶️ Begin Enhancement
                      </button>
                    </div>
                  </div>
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