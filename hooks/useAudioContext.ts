import { useState, useRef, useCallback, useEffect } from "react";

export default function useAudioContext() {
    const [isListeningStatus, setIsListeningStatus] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(-Infinity);
    const [shortSilenceDuration, setShortSilenceDuration] = useState<number>(500);
    const [silenceThreshold, setSilenceThreshold] = useState<number>(-38);

    const audioData = useRef<{ audioBuffer: AudioBuffer; text: string }[]>([]);
    const audioContext = useRef<AudioContext | null>(null);
    const inputStream = useRef<MediaStream | null>(null);
    const analyser = useRef<AnalyserNode | null>(null);
    const dataArray = useRef<Float32Array | null>(null);
    const silenceStartTime = useRef<number | null>(null);
    const longSilenceTimer = useRef<NodeJS.Timeout | null>(null);
    const isRecordingStatus = useRef(false);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const isPlaybackActive = useRef(false);

    // Want to track min/max volume for dynamic thresholding
    const minVolume = useRef<number[]>([-100]);
    const maxVolume = useRef<number[]>([0]);


    /**
    * Creates audio context and other nodes to start listening
    */
    async function startListening(selectedAudioInput: string): Promise<void> {
        try {
            console.log('Starting to listen...');
            inputStream.current = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: selectedAudioInput ? { exact: selectedAudioInput } : undefined }
            });
            audioContext.current = new AudioContext();
            analyser.current = audioContext.current.createAnalyser();
            const source: MediaStreamAudioSourceNode = audioContext.current.createMediaStreamSource(inputStream.current);
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
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
        }
        if (inputStream.current) {
            inputStream.current.getTracks().forEach(track => track.stop());
            inputStream.current = null;
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

        analyser.current.getFloatTimeDomainData(dataArray.current);
        const rms: number = Math.sqrt(dataArray.current.reduce((sum, val) => sum + val * val, 0) / dataArray.current.length);
        const dbFS: number = 20 * Math.log10(rms);
        setVolume(dbFS);
        adjustMinMax(dbFS);

        // Check if audio is playing before allowing user to start recording
        if (!isPlaybackActive.current) {
            if (dbFS < silenceThreshold) {
                if (!silenceStartTime.current) {
                    silenceStartTime.current = Date.now();
                } else {
                    const silenceDuration = Date.now() - silenceStartTime.current;

                    if (silenceDuration > shortSilenceDuration && isRecordingStatus.current) {
                        isRecordingStatus.current = false;
                    }
                }
            } else {
                // Still talking, don't want to process transcript yet
                if (silenceStartTime.current) {
                    silenceStartTime.current = null;

                }
                // Start recording if not already recording
                if (!isRecordingStatus.current) {
                    isRecordingStatus.current = true;
                }
            }
        }

    }, [shortSilenceDuration, silenceThreshold]);

    function adjustMinMax(dbFS: number) {
        
        const maxAverage = maxVolume.current.reduce((acc, val) => acc + val, 0) / maxVolume.current.length;
        const minAverage = minVolume.current.reduce((acc, val) => acc + val, 0) / minVolume.current.length;
        const soundThreshold = minAverage + 5; // Adjust as needed
        const silenceThreshold = maxAverage - 3; // Adjust as needed

        // User is making sound
        if (dbFS > soundThreshold) {
            maxVolume.current = [...maxVolume.current.slice(-20), dbFS];
        }

        // User is not making sound 
        if (dbFS !== -Infinity && dbFS < silenceThreshold) {
            minVolume.current = [...minVolume.current.slice(-20), dbFS];
        }

        console.log('dbFS', dbFS, 'maxAverage:', maxAverage, 'minAverage:', minAverage);
    }

    //Drives the checkAudio function
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (isListeningStatus) {
            intervalId = setInterval(checkAudio, 50);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isListeningStatus, checkAudio]);

    return {
        startListening,
        stopListening,
        volume,
        isRecordingStatus,
        isListeningStatus,
        inputStream,
        audioContext,
        isPlaybackActive,
        // Will eventually be more or less hardcoded, and not needed to be passed around
        setShortSilenceDuration,
        shortSilenceDuration,
        setSilenceThreshold,
        silenceThreshold,
    };
}