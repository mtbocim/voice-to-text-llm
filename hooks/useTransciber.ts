import getVoiceTranscription from "@/actions/getVoiceTranscription";
import { useState } from "react";

export default function useTranscriber() {
    const [fetchingVoiceTranscription, setFetchingVoiceTranscription] = useState<boolean>(false);
    const [isMidSentence, setIsMidSentence] = useState<boolean>(false);
    const [transcription, setTranscription] = useState<string>("");


    /**
     * Currently this is using OpenAI/whisper-1 model
     */
    async function processQueue(queue: Blob[]): Promise<string> {
        setFetchingVoiceTranscription(true);
        const queueToProcess = [...queue];
        let currentTranscription = '';
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
                    // Possible point of sending STT data, not mandatory
                    setIsMidSentence(!results.isMidSentence);
                }
                console.log("currentTranscription in processQueue:", results);
            } catch (error) {
                console.error("Error processing queue:", error);
            }

            // Prompt check for if the user sounds like they have completed a thought
        }
        setFetchingVoiceTranscription(false);
        return currentTranscription;
    }

    return { processQueue, fetchingVoiceTranscription, isMidSentence, transcription }
}