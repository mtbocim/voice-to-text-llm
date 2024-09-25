import { useState } from "react";

type ChatContextItem = {
    role: string;
    content: string;
}

export default function useLLM() {
    const [chatContext, setChatContext] = useState<ChatContextItem[]>([]);
    
    async function getPrimaryResponse(currentMessage:ChatContextItem, context:ChatContextItem[]): Promise<Response> {
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
        // Intentionally not using await here to accelerate the response time
        const response = fetch("/api/generateFeedbackResponse", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages: [...context, currentMessage] }),
        });
        return response
    }

    return { chatContext, setChatContext, getPrimaryResponse, getFeedbackResponse }
}