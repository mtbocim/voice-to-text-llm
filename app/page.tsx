'use client'

//TODO:
/*
    Test pitch shifted audio for better recognition
    Handle a pause in speech gracefully, shouldn't cutout the audio
    Have long silence timer start at same time as short silence timer
    Don't process transcript if getting STT data
    New STT can't happen until transcript response playback starts

*/

import React, { useState, useRef, useEffect, useCallback, use } from 'react';
import getVoiceTranscription from '@/actions/getVoiceTranscription';
import getTranscriptionResponse from '@/actions/getTranscriptionResponse';

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

const AdvancedAudioRecorder: React.FC = () => {
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(-Infinity);
    const [silenceThreshold, setSilenceThreshold] = useState<number>(-50);
    const [shortSilenceDuration, setShortSilenceDuration] = useState<number>(500);
    const [longSilenceDuration, setLongSilenceDuration] = useState<number>(2000);
    const [isSilent, setIsSilent] = useState<boolean>(true);
    const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
    const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
    const [selectedInput, setSelectedInput] = useState<string>('');
    const [selectedOutput, setSelectedOutput] = useState<string>('');
    const [transcription, setTranscription] = useState<string>('');
    const [sendTranscript, setSendTranscript] = useState<boolean>(false);
    const [gettingTransciptData, setGettingTransciptData] = useState<boolean>(false);

    const isRecordingRef = useRef(false);
    const audioContext: AudioContextRef = useRef(null);
    const analyser: AnalyserNodeRef = useRef(null);
    const mediaRecorder: MediaRecorderRef = useRef(null);
    const dataArray: Float32ArrayRef = useRef(null);
    const silenceStartTime: NumberRef = useRef(null);
    const animationFrame: NumberRef = useRef(null);
    const audioChunk = useRef<Blob | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const longSilenceTimer = useRef<NodeJS.Timeout | null>(null);
    const transcriptRef = useRef<string>('');

    useEffect(() => {
        loadAudioDevices();
        return () => {
            stopListening();
        };
    }, []);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    // useEffect(() => {
    //     transcriptRef.current = transcription;
    // }, [transcription]);


    // TODO: Improve this to honor the time better
    // Add state for if waiting for STT data to block getting full response
    useEffect(() => {
        console.log('Does gettingTransciptData actually block?', gettingTransciptData);
        if (sendTranscript && !gettingTransciptData && transcription.length > 0) {
            console.log('Sending transcript:', transcription);
            handleLongSilence(transcription);
            setSendTranscript(false);
        }
    }, [sendTranscript, transcription, gettingTransciptData]);

    async function loadAudioDevices(): Promise<void> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput')
            setAudioInputs(audioInputs);
            setAudioOutputs(audioOutputs)
            if (audioInputs.length > 0) {
                setSelectedInput(audioInputs[0].deviceId);
            }
            console.log('Audio devices loaded:', audioInputs);
        } catch (error) {
            console.error('Error loading audio devices:', error);
        }
    }



    async function startListening(): Promise<void> {
        try {
            console.log('Starting to listen...');
            stream.current = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: selectedInput ? { exact: selectedInput } : undefined }
            });
            audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
            analyser.current = audioContext.current.createAnalyser();
            const source: MediaStreamAudioSourceNode = audioContext.current.createMediaStreamSource(stream.current);
            source.connect(analyser.current);

            analyser.current.fftSize = 2048;
            dataArray.current = new Float32Array(analyser.current.fftSize);

            setIsListening(true);
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
        setIsListening(false);
        setIsRecording(false);
        setVolume(-Infinity);
        setIsSilent(true);
        console.log('Listening stopped');
    }

    const checkAudio = useCallback(() => {
        if (!analyser.current || !dataArray.current) return;

        analyser.current.getFloatTimeDomainData(dataArray.current);
        const rms: number = Math.sqrt(dataArray.current.reduce((sum, val) => sum + val * val, 0) / dataArray.current.length);
        const dbFS: number = 20 * Math.log10(rms);
        setVolume(dbFS);


        // TODO: Clarify what happens during silence

        if (dbFS < silenceThreshold) {
            // Set silence start time if not already set
            if (!silenceStartTime.current) {
                console.log('Setting silence start time');
                silenceStartTime.current = Date.now();                    
                console.log('Starting long silence timer');
                longSilenceTimer.current = setTimeout(()=>setSendTranscript(true), longSilenceDuration);
            } else {
                const silenceDuration = Date.now() - silenceStartTime.current;

                if (silenceDuration > shortSilenceDuration && isRecordingRef.current) {
                    console.log('Stopping recording due to short silence');
                    stopRecording();
                    setIsRecording(false);
                }
            }
            setIsSilent(true);
        } else {
            // Still talking, don't want to process transcript yet
            if (silenceStartTime.current) {
                silenceStartTime.current = null;
                if (longSilenceTimer.current) {
                    clearTimeout(longSilenceTimer.current);
                }
            }
            setIsSilent(false);
            // Start recording if not already recording
            if (!isRecordingRef.current) {
                startRecording();
                setIsRecording(true);
            }
        }

        animationFrame.current = requestAnimationFrame(checkAudio);
    }, [silenceThreshold, shortSilenceDuration, longSilenceDuration, transcription]);

    // This starts recorder correctly, don't change for now!!!
    // useEffect(() => {
    //     // console.log("what is state", mediaRecorder.current?.state)
    //     if (isRecording && mediaRecorder.current?.state === undefined) {
    //         startRecording();
    //     }
    // }, [isRecording]);

   



    function startRecording(): void {
        console.log('Starting recording...');
        if (stream.current && !mediaRecorder.current) {
            mediaRecorder.current = new MediaRecorder(stream.current, { mimeType: 'audio/webm' });
            mediaRecorder.current.ondataavailable = handleDataAvailable;
            mediaRecorder.current.onstop = handleRecordingStop;
            mediaRecorder.current.start();
        }
    }

    function stopRecording(): void {
        console.log('Stopping recording...');
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
        }
    }

    function handleDataAvailable(event: BlobEvent): void {
        if (event.data.size > 0) {
            audioChunk.current = event.data;
            console.log('Audio chunk received:', event.data.size, 'bytes');
        }
    }

    
    // When called creates a closure, can't see current variable data
    async function handleRecordingStop(): void {
        if (audioChunk.current) {
            console.log('Processing audio chunk');
            
            // Keep this for checking audio data quality
            // const audioBuffer = await audioChunk.current.arrayBuffer();
            // const buffer = Buffer.from(audioBuffer);
            // const audio = new Audio('data:audio/webm;base64,' + buffer.toString('base64'));
            // audio.play();

            setGettingTransciptData(true);
            const formData = new FormData();
            formData.append('file', audioChunk.current, 'audio.webm');
            formData.append('model', 'whisper-1');
            formData.append('previousTranscript', transcriptRef.current);
            const results = await getVoiceTranscription(formData);
            setTranscription((prev) => prev + ' ' + results);
            transcriptRef.current = results;
            setGettingTransciptData(false);

        }
        mediaRecorder.current = null;
    }

    async function handleLongSilence(t): void {
        const start = new Date();
        console.log('Long silence detected. Sending full transcription for processing.');
        // const result = await getTranscriptionResponse(transcription);
        // console.log('Transcription response received:');
        // const end = new Date();
        // playAudio(result)
        // console.log('Time taken:', end - start, 'ms');
        
        setTranscription('')
        transcriptRef.current = ''
    }

    function playAudio(audioData:string){
        const audioSrc = 'data:audio/webm;base64,' + audioData;
        const audio = new Audio(audioSrc);
        console.log('Audio received and parsed', new Date());
        audio.play();
    }


    return (
        <div className="p-4 max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">Advanced Audio Recorder</h1>
            <div className="mb-4">
                <label className="block mb-2">Select Audio Input:</label>
                <select
                    value={selectedInput}
                    onChange={(e) => setSelectedInput(e.target.value)}
                    className="w-full p-2 border rounded"
                >
                    {audioInputs.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                        </option>
                    ))}
                </select>
            </div>
            <div className="mb-4">
                <label className="block mb-2">Select Audio Output:</label>
                <select
                    value={selectedOutput}
                    onChange={(e) => setSelectedOutput(e.target.value)}
                    className="w-full p-2 border rounded"
                >
                    {audioOutputs.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                        </option>
                    ))}
                </select>
            </div>
            <button
                className={`px-4 py-2 rounded ${isListening ? 'bg-red-500' : 'bg-green-500'} text-white mb-4`}
                onClick={isListening ? stopListening : startListening}
            >
                {isListening ? 'Stop Listening' : 'Start Listening'}
            </button>
            <div className="mb-4">
                <label className="block mb-2">
                    Current Volume: {volume === -Infinity ? '-∞' : volume.toFixed(2)} dB
                </label>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                        className="bg-blue-600 h-2.5 rounded-full"
                        style={{ width: `${Math.max(0, (volume + 100) / 100 * 100)}%` }}
                    ></div>
                </div>
            </div>
            <div className="mb-4">
                <label className="block mb-2">
                    Silence Threshold: {silenceThreshold} dB
                </label>
                <input
                    type="range"
                    min="-100"
                    max="0"
                    value={silenceThreshold}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSilenceThreshold(Number(e.target.value))}
                    className="w-full"
                />
            </div>
            <div className="mb-4">
                <label className="block mb-2">
                    Short Silence Duration: {shortSilenceDuration} ms
                </label>
                <input
                    type="range"
                    min="100"
                    max="2000"
                    step="100"
                    value={shortSilenceDuration}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShortSilenceDuration(Number(e.target.value))}
                    className="w-full"
                />
            </div>
            <div className="mb-4">
                <label className="block mb-2">
                    Long Silence Duration: {longSilenceDuration} ms
                </label>
                <input
                    type="range"
                    min="1000"
                    max="5000"
                    step="100"
                    value={longSilenceDuration}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLongSilenceDuration(Number(e.target.value))}
                    className="w-full"
                />
            </div>
            <div className={`p-4 rounded ${isSilent ? 'bg-red-200' : 'bg-green-200'}`}>
                {isSilent ? 'Silence Detected' : 'Audio Detected'}
            </div>
            <div className={`p-4 rounded mt-4 ${isRecording ? 'bg-yellow-200' : 'bg-gray-200'}`}>
                Recording Status: {isRecording ? 'Recording' : 'Not Recording'}
            </div>
            <div>{transcription}</div>
        </div>
    );
};

export default AdvancedAudioRecorder;