import { GoogleGenAI, Modality } from "@google/genai";

const apiKey = '1A3e9nrHATGBce2DXFfafJkFPOCdUAU2hSTbyGGf';
const ai = new GoogleGenAI({ apiKey: apiKey });

type EnhancementMethod = 'smart' | 'normal' | 'direct';

/**
 * Analyzes an image with a text model to generate a descriptive context.
 * @param frameBase64 The base64-encoded string of the frame.
 * @returns A promise that resolves with a text description of the image.
 */
const analyzeFrameForContext = async (frameBase64: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: frameBase64,
                            mimeType: 'image/jpeg',
                        },
                    },
                    {
                        text: "Briefly describe the main subject and setting of this image in a simple, factual sentence. This will be used as context for an image enhancement model.",
                    },
                ],
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error analyzing frame for context:", error);
        // Return an empty string to allow the enhancement to proceed without context
        return ""; 
    }
};


/**
 * Sends a single animation frame to the Gemini API for visual enhancement.
 * Supports multiple enhancement strategies for robustness.
 * @param frameBase64 The base64-encoded string of the frame to enhance.
 * @param method The enhancement strategy to use: 'smart', 'normal', or 'direct'.
 * @returns A promise that resolves with the base64-encoded string of the enhanced frame.
 */
export const enhanceFrame = async (frameBase64: string, method: EnhancementMethod): Promise<string> => {
    try {
        let contextText = "";
        if (method === 'smart') {
            contextText = await analyzeFrameForContext(frameBase64);
        }

        let enhancementPrompt = "";
        switch (method) {
            case 'smart':
                enhancementPrompt = `You are an expert at restoring and upscaling old animation cels.
                ${contextText ? `The user has provided the following context for this image: "${contextText}". Use this to inform your enhancement.` : ''}
                Enhance this image by increasing its resolution, sharpening the lines, correcting colors, and removing compression artifacts.
                **Crucially, do not add, remove, or change any elements, characters, or objects in the original composition.** 
                The result must be a cleaned-up, higher-quality version of the exact same image.`;
                break;
            case 'normal':
                enhancementPrompt = `You are an expert at restoring and upscaling old animation cels.
                Enhance this image by increasing its resolution, sharpening the lines, correcting colors, and removing compression artifacts.
                **Crucially, do not add, remove, or change any elements, characters, or objects in the original composition.** 
                The result must be a cleaned-up, higher-quality version of the exact same image.`;
                break;
            case 'direct':
                enhancementPrompt = `Upscale and enhance the quality of this animation frame. Do not change the content.`;
                break;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: frameBase64,
                            mimeType: 'image/jpeg',
                        },
                    },
                    {
                        text: enhancementPrompt,
                    },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                return part.inlineData.data;
            }
        }

        throw new Error("AI response did not contain an enhanced image.");

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown AI error";
        console.error(`Error in enhanceFrame service with method '${method}':`, errorMessage);
        throw new Error(`Failed to enhance frame with '${method}' method. Reason: ${errorMessage}`);
    }
};


/**
 * Generates a short video clip from an image and a text prompt using the Veo model.
 * @param frameBase64 The base64-encoded string of the reference frame.
 * @param prompt The text prompt describing the desired animation.
 * @returns A promise that resolves with a local blob URL for the generated MP4 video.
 */
export const generateVideoWithVeo = async (frameBase64: string, prompt: string): Promise<string> => {
    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: prompt,
            image: {
              imageBytes: frameBase64,
              mimeType: 'image/jpeg',
            },
            config: {
              numberOfVideos: 1
            }
        });

        // Poll for completion, as video generation is a long-running operation.
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation completed, but no download link was provided.");
        }

        // Fetch the video file. The API key must be appended to the download URL.
        const response = await fetch(`${downloadLink}&key=${apiKey}`);
        if (!response.ok) {
            throw new Error(`Failed to download the generated video. Status: ${response.status}`);
        }
        
        const videoBlob = await response.blob();
        return URL.createObjectURL(videoBlob);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown AI error";
        console.error(`Error in generateVideoWithVeo service:`, errorMessage);
        throw new Error(`Failed to generate video with Veo. Reason: ${errorMessage}`);
    }
};