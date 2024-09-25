import { useState } from "react";

type ChatContextItem = {
    role: string;
    content: string;
}

export default function useLLM() {
    const [chatContext, setChatContext] = useState<ChatContextItem[]>([]);
    async function getResponse(currentMessage:ChatContextItem, context:ChatContextItem[]): Promise<Response> {
        const response = await fetch("/api/generateTextResponse", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages: [...context, currentMessage] }),
        });
        return response
    }

    async function getFeedbackResponse(currentMessage:ChatContextItem, context:ChatContextItem[]): Promise<Response> {
         const response = fetch("/api/generateFeedbackResponse", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages: [...context, currentMessage] }),
        });
        return response
    }


    // async function handleLongSilence(t: string): Promise<void> {
    //     console.log(
    //         "Long silence detected. Sending full transcription for processing."
    //     );
    //     const currentMessage = { role: "user", content: t };
    //     const response = getResponse(currentMessage, chatContext);
    //     const feedbackResponse = getFeedbackResponse(currentMessage, chatContext);
    //     let processedText = await processTextStream(response, audioContext, audioData, selectedTTSVoice, isRecordingStatus);
    //     if (processedText.trim() === "") {
    //         // Placeholder until I have a better idea of why an empty string would be generated as a response
    //         processedText = "...";
    //     }
    //     setChatContext([
    //         ...chatContext,
    //         currentMessage,
    //         { role: "assistant", content: processedText },
    //     ]);
    //     currentTranscription.current = "";
    //     const feedback = await feedbackResponse;
    //     const feedbackData = await feedback.json();
    //     // console.log('Feedback:', feedbackData.text);
    //     setFeedback(feedbackData.text);
    // }
    return { chatContext, setChatContext, getResponse, getFeedbackResponse }
}