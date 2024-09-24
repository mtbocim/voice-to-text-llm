import { useCallback, useRef } from "react";

//TODO: think about this like real audio equipment
interface MediaRecorderRef {
    current: MediaRecorder | null;
}

export default function useAudioRecorder() {
    const mediaRecorder: MediaRecorderRef = useRef(null);
    const speechToTextDataQueue = useRef<Blob[]>([]);
    const audioChunk = useRef<Blob | null>(null);

    const startRecording = useCallback(function startRecording(stream: MediaStream): void {
        function handleDataAvailable(event: BlobEvent): void {
            if (event.data.size > 0) {
                audioChunk.current = event.data;
            }
        }

        // When called creates a closure, can't see current state data
        function handleRecordingStop(): void {
            if (audioChunk.current) {
                speechToTextDataQueue.current.push(audioChunk.current);
            }
            mediaRecorder.current = null;
        }

        if (stream && !mediaRecorder.current) {
            mediaRecorder.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.current.ondataavailable = handleDataAvailable;
            mediaRecorder.current.onstop = handleRecordingStop;
            mediaRecorder.current.start();
        }
    }, [])

    function stopRecording(): void {
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
        }
    }

    return { startRecording, stopRecording, speechToTextDataQueue };
}