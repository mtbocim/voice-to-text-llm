import { useState, useRef, useCallback, useEffect } from "react";

export default function useAudioContext() {
    const [isAudioContextActive, setIsAudioContextActive] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(-Infinity);
    const [shortSilenceDuration, setShortSilenceDuration] = useState<number>(500);
    const [silenceThreshold, setSilenceThreshold] = useState<number>(-38);

    const audioData = useRef<{ audioBuffer: AudioBuffer; text: string }[]>([]);
    const audioContext = useRef<AudioContext | null>(null);
    const inputStream = useRef<MediaStream | null>(null);
    const analyser = useRef<AnalyserNode | null>(null);
    const timeDomainDataArray = useRef<Float32Array | null>(null);
    const silenceStartTime = useRef<number | null>(null);
    const longSilenceTimer = useRef<NodeJS.Timeout | null>(null);
    const isRecordingStatus = useRef(false);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const isPlaybackActive = useRef(false);

    // Want to track min/max volume for dynamic thresholding
    const minVolumeSample = useRef<number[]>([-70]);
    const maxVolumeSample = useRef<number[]>([0]);
    const [volumeAverages, setVolumeAverages] = useState<{ min: number, max: number }>({ min: -70, max: 0 });

    // For testing purposes, might remove later
    const freqDataArray = useRef<Float32Array | null>(null);

    /**
    * Creates audio context and other nodes to start listening
    */
    async function startListening(selectedAudioInput: string): Promise<void> {
        try {
            console.log('Starting to listen...');
            
            inputStream.current = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: selectedAudioInput ? { exact: selectedAudioInput } : undefined,  noiseSuppression: true, autoGainControl:true, echoCancellation: true }
            });
            if (!audioContext.current) {
                audioContext.current = new AudioContext();
            } else{
                audioContext.current.resume();
            }
            analyser.current = audioContext.current.createAnalyser();
            analyser.current.fftSize = 2048;
            timeDomainDataArray.current = new Float32Array(analyser.current.fftSize);
            freqDataArray.current = new Float32Array(analyser.current.frequencyBinCount);
            
            const source: MediaStreamAudioSourceNode = audioContext.current.createMediaStreamSource(inputStream.current);
            source.connect(analyser.current);

            setIsAudioContextActive(true);
            checkAudio();
            console.log('Listening started');
        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    }
    // Stops listening and resets all the values

    function stopListening(): void {
        console.log('Stopping listening...');
        if (audioContext.current) {
            audioContext.current.suspend();
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
        setIsAudioContextActive(false);
        isRecordingStatus.current = false;
        isPlaybackActive.current = false;
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
        if (!isAudioContextActive || !analyser.current || !timeDomainDataArray.current || !freqDataArray.current) return;

        const rms: number = Math.sqrt(timeDomainDataArray.current.reduce((sum, val) => sum + val * val, 0) / timeDomainDataArray.current.length);
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

    }, [shortSilenceDuration, silenceThreshold, isAudioContextActive]);

    // Where I calculate the min/max volume for dynamic silence thresholding
    function adjustMinMax(dbFS: number) {
        // Don't ever care about storing this case
        if (dbFS === -Infinity) return;

        const maxAverage = maxVolumeSample.current.reduce((acc, val) => acc + val, 0) / maxVolumeSample.current.length;
        const minAverage = minVolumeSample.current.reduce((acc, val) => acc + val, 0) / minVolumeSample.current.length;


        // exponential moving average calculation
        // https://en.wikipedia.org/wiki/Moving_average
        // Hysteresis to prevent rapid switching between states
        // https://en.wikipedia.org/wiki/Hysteresis
        const maxHysteresis = 5; // dB 
        const minHysteresis = 3; // dB
        const alpha = 0.01; // EMA smoothing factor (adjust as needed)

        if (Math.abs(dbFS - (maxAverage + maxHysteresis)) < Math.abs(dbFS - (minAverage - minHysteresis))) {
            // Update maxVolumeSample
            maxVolumeSample.current = maxVolumeSample.current.length > 0
                ? maxVolumeSample.current.map((val) => alpha * dbFS + (1 - alpha) * val)
                : [dbFS];
        } else {
            // Update minVolumeSample
            minVolumeSample.current = minVolumeSample.current.length > 0
                ? minVolumeSample.current.map((val) => alpha * dbFS + (1 - alpha) * val)
                : [dbFS];
        }

        setVolumeAverages({ min: minAverage, max: maxAverage });
        setSilenceThreshold(minAverage + 30);
    }

    //Drives the checkAudio function
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (isAudioContextActive) {
            intervalId = setInterval(checkAudio, 50);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isAudioContextActive, checkAudio]);

    return {
        startListening,
        stopListening,
        volume,
        isRecordingStatus,
        isListeningStatus: isAudioContextActive,
        inputStream,
        audioContext,
        isPlaybackActive,
        volumeAverages,
        // Will eventually be more or less hardcoded, and not needed to be passed around
        setShortSilenceDuration,
        shortSilenceDuration,
        setSilenceThreshold,
        silenceThreshold,
    };
}
/*
Keeping this for if I want to play around with it at a later point

analyser.current.getFloatTimeDomainData(timeDomainDataArray.current);

//calculate the user's vocal frequencies so I can filter out extraneous noise
analyser.current.getFloatFrequencyData(freqDataArray.current);
const lowFreqIndex = Math.floor(freqDataArray.current.length * 0.1); // 10% of the array
const midFreqIndex = Math.floor(freqDataArray.current.length * 0.5); // 50%
const highFreqIndex = Math.floor(freqDataArray.current.length * 0.9); // 90%

console.log(
    "Frequency Data Summary:",
    "\nLow Freq:", freqDataArray.current[lowFreqIndex],
    "\nMid Freq:", freqDataArray.current[midFreqIndex],
    "\nHigh Freq:", freqDataArray.current[highFreqIndex]
);

*/