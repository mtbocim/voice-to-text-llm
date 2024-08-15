'use client'

/*
TODO:
    Add silence volume detection for dynamic silence threshold setting
*/

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCompletion, useChat } from 'ai/react';
import getVoiceTranscription from '@/actions/getVoiceTranscription';
// import getTranscriptionResponse from '@/actions/getTranscriptionResponse';

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

function AdvancedAudioRecorder() {
    // Convert to ref?
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [silenceThreshold, setSilenceThreshold] = useState<number>(-50);
    const [shortSilenceDuration, setShortSilenceDuration] = useState<number>(500);
    const [longSilenceDuration, setLongSilenceDuration] = useState<number>(2000);

    // Updating UI, keep as state
    const [volume, setVolume] = useState<number>(-Infinity);
    const [isSilent, setIsSilent] = useState<boolean>(true);
    const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
    const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
    const [selectedInput, setSelectedInput] = useState<string>('');
    const [selectedOutput, setSelectedOutput] = useState<string>('');
    const [transcription, setTranscription] = useState<string>('');
    const [sendTranscript, setSendTranscript] = useState<boolean>(false);
    const [gettingTranscriptData, setGettingTranscriptData] = useState<boolean>(false);
    const [availableVoices, setAvailableVoices] = useState<[]>([]);
    const [voice, setVoice] = useState<string>('');
    const [voicePlaying, setVoicePlaying] = useState<boolean>(false);

    const audioQueue = useRef<Blob[]>([]);
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
    const previousText = useRef<string>('');


    // This is good, it's handling message state for me
    const { messages, append } = useChat({
        api: '/api/generateTextResponse',
    })

    useEffect(() => {
        console.log("Messages", messages, "Voice Playing", voicePlaying)
        async function getVoiceTranscription() {
            const ex = /(.*?[.!?])\s+/gm
            const currentMessage = messages.slice(-1)[0]
            
            console.log('Inside getVoiceTranscription, what is currentMessage?', currentMessage)
            if (currentMessage.role !== 'user') {
                // Okay, this is looping correctly!
                console.log('Messages:', messages.slice(-1)[0].content.match(ex))

                // Here beginneth the experiment
                const sentences = currentMessage.content.match(ex) as string[]
                const textToProcess = sentences?.join('').replace(previousText.current, '')
                console.log('Text to process:', textToProcess, 'previous', previousText.current, 'voice', voice)
                if (textToProcess && textToProcess !== '') {
                    getTextToVoice(previousText.current, textToProcess, voice)
                    previousText.current = sentences?.join('')
                } else {
                    setVoicePlaying(false);
                }
            }else{
                setVoicePlaying(false);
            }
        }
        if (!voicePlaying && messages.length > 0) {
            setVoicePlaying(true);
            getVoiceTranscription();
        }
    }, [messages.slice(-1)[0]?.content]);

    useEffect(() => {
        loadAudioDevices();
        return () => {
            stopListening();
        };
    }, []);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);




    // Get available voices from the ElevenLabs API
    useEffect(() => {
        async function fetchAvailableVoices() {
            const response = await fetch('https://api.elevenlabs.io/v1/voices');
            const data = await response.json();
            console.log('Available voices:', data);
            setAvailableVoices(data.voices);
            setVoice(data.voices[0].id);
        }
        fetchAvailableVoices();
    }, []);


    // TODO: Improve this to honor the time better
    // Add state for if waiting for STT data to block getting full response
    useEffect(() => {
        console.log('Does gettingTransciptData actually block?', gettingTranscriptData);
        if (sendTranscript && !gettingTranscriptData && transcription.length > 0) {
            console.log('Sending transcript:', transcription);
            handleLongSilence(transcription);
            setSendTranscript(false);
        }
    }, [sendTranscript, transcription, gettingTranscriptData]);

    useEffect(() => {
        if (audioQueue.current.length > 0 && !gettingTranscriptData) {
            processQueue(); // Process the queue whenever there's new data
        }
    }, [audioQueue.current.length, gettingTranscriptData]);

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

    async function processQueue(): Promise<void> {
        while (audioQueue.current.length > 0) {
            const audioChunk = audioQueue.current.shift();
            setGettingTranscriptData(true);
            const formData = new FormData();
            formData.append('file', audioChunk, 'audio.webm');
            formData.append('model', 'whisper-1');
            formData.append('previousTranscript', transcriptRef.current);
            const results = await getVoiceTranscription(formData);
            setTranscription((prev) => prev + ' ' + results);
            transcriptRef.current = results;
            setGettingTranscriptData(false);
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
                longSilenceTimer.current = setTimeout(() => setSendTranscript(true), longSilenceDuration);
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


    // When called creates a closure, can't see current state data
    async function handleRecordingStop(): void {
        if (audioChunk.current) {
            console.log('Processing audio chunk');

            // Keep this for checking audio data quality
            // const audioBuffer = await audioChunk.current.arrayBuffer();
            // const buffer = Buffer.from(audioBuffer);
            // const audio = new Audio('data:audio/webm;base64,' + buffer.toString('base64'));
            // audio.play();

            //TODO: Add chunks to queue, handle processing elsewhere
            audioQueue.current.push(audioChunk.current);

            //Do this somewhere else


        }
        mediaRecorder.current = null;
    }

    async function handleLongSilence(t): void {
        const start = new Date();
        console.log('Long silence detected. Sending full transcription for processing.');

        // await complete(t);
        await append({ content: t, role: 'user' })
        setTranscription('')
        transcriptRef.current = ''

        // Can I set the last message received as the current state here or do I need to do that elsewhere?
        // TODO: Modify to generate and stream text, and call the ElevenLabs API at sentence breaks

        // const response = await fetch('/api/generateVoice', {
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/json'
        //     },
        //     body: JSON.stringify({ transcription: t, voice })
        // });

        // if (!response.ok) {
        //     throw new Error('Network response was not ok');
        // }

        // const end = new Date();
        // console.log('Time taken for text response and start voice output:', end - start, 'ms');


        // const audioContext = new AudioContext();
        // const source = audioContext.createBufferSource();
        // try {
        //     const reader = response.body.getReader();
        //     if (!reader) {
        //         throw new Error('No reader');
        //     }
        //     const stream = new ReadableStream({
        //         start(controller) {
        //             function push() {
        //                 reader.read().then(({ done, value }) => {
        //                     if (done) {
        //                         controller.close();
        //                         return;
        //                     }
        //                     controller.enqueue(value);
        //                     push();
        //                 });
        //             }

        //             push();
        //         }
        //     });

        //     const audioBuffer = await audioContext.decodeAudioData(await new Response(stream).arrayBuffer());
        //     source.buffer = audioBuffer;
        //     source.connect(audioContext.destination);

        //     source.start(0);

        //     setTranscription('')
        //     transcriptRef.current = ''
        // } catch (error) {
        //     console.error('Error processing audio data:', error);
        // }
    }

    async function getTextToVoice(priorText: string, currentSentence: string, selectedVoice: string): void {
        console.log("previousText", priorText, "voice", selectedVoice, "currentSentence", currentSentence)

        const response = await fetch('/api/generateVoiceResponse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ previousText: priorText, currentSentence, voice: selectedVoice })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const audioContext = new AudioContext();
        const source = audioContext.createBufferSource();
        try {
            const reader = response.body.getReader();
            if (!reader) {
                throw new Error('No reader');
            }
            const stream = new ReadableStream({
                start(controller) {
                    function push() {
                        reader.read().then(({ done, value }) => {
                            if (done) {
                                controller.close();
                                return;
                            }
                            controller.enqueue(value);
                            push();
                        });
                    }
                    push();
                }
            });

            const audioBuffer = await audioContext.decodeAudioData(await new Response(stream).arrayBuffer());
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.onended = () => {
                setVoicePlaying(false);
                previousText.current =  '';
            }
            source.start(0);

            setTranscription('')
            transcriptRef.current = ''
        } catch (error) {
            console.error('Error processing audio data:', error);
        }
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
            <div className="mb-4">
                <label className="block mb-2">Select Voice:</label>
                <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full p-2 border rounded"
                >
                    {availableVoices.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                            {voice.name}
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