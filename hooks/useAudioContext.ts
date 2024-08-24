import { useState, useRef, useCallback } from "react";
import { set } from "zod";

interface AudioContextRef {
    current: AudioContext | null;
}

interface AnalyserNodeRef {
    current: AnalyserNode | null;
}

interface MediaRecorderRef {
    current: MediaRecorder | null;
}

interface Float32ArrayRef {
    current: Float32Array | null;
}

interface NumberRef {
    current: number | null;
}

export default function useAudioContext() {
    const [isListeningStatus, setIsListeningStatus] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(-Infinity);
    const [shortSilenceDuration, setShortSilenceDuration] = useState<number>(500);
    const [longSilenceDuration, setLongSilenceDuration] = useState<number>(1000);
    const [silenceThreshold, setSilenceThreshold] = useState<number>(-38);
    const [sendTranscript, setSendTranscript] = useState<boolean>(false);

    const audioData = useRef<{ audioBuffer: AudioBuffer, text: string }[]>([]);
    const audioContext: AudioContextRef = useRef(null);
    const stream = useRef<MediaStream | null>(null);
    const analyser: AnalyserNodeRef = useRef(null);
    const dataArray: Float32ArrayRef = useRef(null);
    const silenceStartTime: NumberRef = useRef(null);
    const longSilenceTimer = useRef<NodeJS.Timeout | null>(null);
    const animationFrame: NumberRef = useRef(null);
    const isRecordingStatus = useRef(false);
    const mediaRecorder: MediaRecorderRef = useRef(null);
    const playbackActiveRef = useRef<boolean>(false);



    /**
 * Creates audio context and other nodes to start listening
 */
    async function startListening(selectedAudioInput: string): Promise<void> {
        try {
            console.log('Starting to listen...');
            stream.current = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: selectedAudioInput ? { exact: selectedAudioInput } : undefined }
            });
            audioContext.current = new AudioContext();
            analyser.current = audioContext.current.createAnalyser();
            const source: MediaStreamAudioSourceNode = audioContext.current.createMediaStreamSource(stream.current);
            source.connect(analyser.current);

            analyser.current.fftSize = 2048;
            dataArray.current = new Float32Array(analyser.current.fftSize);

            setIsListeningStatus(true);
            checkAudio();
            console.log('Listening started');
        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    }

    function stopListening(): void {
        console.log('Stopping listening...');
        if (audioContext.current) {
            audioContext.current.close();
            audioContext.current = null;
        }
        if (animationFrame.current) {
            cancelAnimationFrame(animationFrame.current);
        }
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
        }
        if (stream.current) {
            stream.current.getTracks().forEach(track => track.stop());
            stream.current = null;
        }
        if (longSilenceTimer.current) {
            clearTimeout(longSilenceTimer.current);
        }
        setIsListeningStatus(false);
        isRecordingStatus.current = false;
        setVolume(-Infinity);
        audioData.current = [];
        console.log('Listening stopped');
    }

    /**
     * Controller function to check the audio data
     * It should tell me data and 'flip some switches'
     */
    const checkAudio = useCallback(() => {
        // Cancel startup if audioContext is not set
        // This stops the recursive call to checkAudio
        if (!analyser.current || !dataArray.current) return;
        // console.log('Checking audio...', analyser.current, dataArray.current);

        analyser.current.getFloatTimeDomainData(dataArray.current);
        const rms: number = Math.sqrt(dataArray.current.reduce((sum, val) => sum + val * val, 0) / dataArray.current.length);
        const dbFS: number = 20 * Math.log10(rms);
        setVolume(dbFS);

        // Check if audio is playing before allowing user to start recording
        if (!playbackActiveRef.current) {
            if (dbFS < silenceThreshold) {
                // Set silence start time if not already set
                //Might move following lines to useEffect as debounce
                if (!silenceStartTime.current) {
                    silenceStartTime.current = Date.now();
                    longSilenceTimer.current = setTimeout(() => setSendTranscript(true), longSilenceDuration);
                } else {
                    const silenceDuration = Date.now() - silenceStartTime.current;

                    if (silenceDuration > shortSilenceDuration && isRecordingStatus.current) {
                        // stopRecording();
                        isRecordingStatus.current = false;
                    }
                }
            } else {
                // Still talking, don't want to process transcript yet
                if (silenceStartTime.current) {
                    silenceStartTime.current = null;
                    if (longSilenceTimer.current) {
                        clearTimeout(longSilenceTimer.current);
                    }
                }
                // Start recording if not already recording
                if (!isRecordingStatus.current) {
                    // startRecording();
                    isRecordingStatus.current = true;
                }
            }
        }
        //     // Recursive call to check audio
        animationFrame.current = requestAnimationFrame(checkAudio);
    }, [shortSilenceDuration, longSilenceDuration, silenceThreshold]);

    return {
        startListening,
        stopListening,
        setShortSilenceDuration,
        setLongSilenceDuration,
        setSilenceThreshold,
        setSendTranscript,
        volume,
        sendTranscript,
        isRecordingStatus,
        isListeningStatus,
        silenceThreshold,
        shortSilenceDuration,
        longSilenceDuration,
        stream,
        audioContext
    };
}


// useEffect(() => {
//     // let handle: NodeJS.Timeout;
//     if (volume < silenceThreshold && longSilenceTimer.current === null && currentTranscription.current.length > 0) {
//         silenceStartTime.current = Date.now();
//         longSilenceTimer.current = setTimeout(() => setSendTranscript(true), longSilenceDuration);

//         const silenceDuration = Date.now() - silenceStartTime.current;
//         if (silenceDuration > shortSilenceDuration && isRecordingStatus.current) {
//             stopRecording();
//             isRecordingStatus.current = false;
//         }
//         console.log('Silence detected', longSilenceTimer.current);
//     }

//     return () => {
//         if (longSilenceTimer.current) {
//             clearTimeout(longSilenceTimer.current);
//             longSilenceTimer.current = null;
//         }
//     }
// }, [volume, silenceThreshold, longSilenceDuration, shortSilenceDuration]);