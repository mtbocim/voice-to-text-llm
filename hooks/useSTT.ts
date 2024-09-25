import getVoiceTranscription from "@/actions/getVoiceTranscription";
import { useState } from "react";

export default function useSTT() {
    const [fetchingVoiceTranscription, setFetchingVoiceTranscription] = useState<boolean>(false);

    /**
     * Currently this is using OpenAI/whisper-1 model
     */
    async function processQueue(queue: Blob[]): Promise<{currentTranscription: string, isMidSentence: boolean}> {
        setFetchingVoiceTranscription(true);
        const queueToProcess = [...queue];
        let currentTranscription = '';
        let isMidSentence = false;
        while (queueToProcess.length > 0) {
            const audioChunk = queue.shift() as Blob;
            if (!audioChunk) {
                break;
            }
            const formData = new FormData();
            formData.append("file", audioChunk, "audio.webm");
            formData.append("model", "whisper-1");
            formData.append("previousTranscript", currentTranscription);
            try {
                const results = await getVoiceTranscription(formData);
                if (results) {
                    currentTranscription = currentTranscription + " " + results.newText
                }
                console.log("currentTranscription in processQueue:", results);
            } catch (error) {
                console.error("Error processing queue:", error);
            }

            // Prompt check for if the user sounds like they have completed a thought
        }
        setFetchingVoiceTranscription(false);
        return {currentTranscription, isMidSentence };
    }

    return { processQueue, fetchingVoiceTranscription }
}