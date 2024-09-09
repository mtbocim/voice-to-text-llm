"use client";

/*
TODO:
  - add a cutoff so that random quiet noise aren't recorded
*/

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Accordion, AccordionItem } from "@nextui-org/react";
import getVoiceTranscription from "@/actions/getVoiceTranscription";
import useAudioContext from "@/hooks/useAudioContext";
import useRecordAudio from "@/hooks/useRecordAudio";
import useTranscriber from "@/hooks/useTranscriber";

import * as Tone from "tone";

const COLOR_MAP = {
  user: "bg-blue-200",
  assistant: "bg-green-200",
  feedback: "bg-yellow-200",
};

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

function AdvancedAudioRecorder() {
  const {
    startListening,
    stopListening,
    setShortSilenceDuration,
    volume,
    volumeAverages,
    isRecordingStatus,
    isListeningStatus,
    isPlaybackActive,
    silenceThreshold,
    shortSilenceDuration,
    // inputStream,
    audioContext,
    inputDevice,
    waveformAnalyser,
  } = useAudioContext();

  const {
    startTranscription,
    stopTranscription,
    transcriptText,
    isTranscribing,
  } = useTranscriber(waveformAnalyser);

  const { startRecording, stopRecording, speechToTextDataQueue } =
    useRecordAudio(inputDevice);

  // Updating UI (which includes audio playback), keep as state
  const [chatContext, setChatContext] = useState<
    { role: string; content: string }[]
  >([]);
  const [availableAudioDevices, setAvailableAudioDevices] = useState<
    MediaDeviceInfo[]
  >([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>("");
  const [availableTTSVoices, setAvailableVoices] = useState<string[]>([]);
  const [selectedTTSVoice, setVoice] = useState<string>("");
  const [fetchingVoiceTranscription, setFetchingVoiceTranscription] =
    useState<boolean>(false);
  const [processTranscription, setProcessTranscription] =
    useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>("");

  // Keep as ref
  const audioData = useRef<{ audioBuffer: AudioBuffer; text: string }[]>([]);
  const currentTranscription = useRef<string>("");
  const spokenText = useRef<string>("");

  // Work in progress, trying to improve response flow
  const isInMiddleOfSentence = useRef<boolean>(false);
  const blockRecording = useRef<boolean>(false);

  /**
   * Processes the audio queue and sends the audio to the OpenAI API for transcription
   */
  async function processQueue(): Promise<void> {
    while (speechToTextDataQueue.current.length > 0) {
      const formData = new FormData();
      const audioChunk = speechToTextDataQueue.current.shift() as Blob;
      formData.append("file", audioChunk, "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("previousTranscript", currentTranscription.current);
      try {
        const results = await getVoiceTranscription(formData);
        if (results) {
          currentTranscription.current =
            currentTranscription.current + " " + results.newText;
          isInMiddleOfSentence.current = results.isMidSentence;

          // Possible point of sending STT data, not mandatory
          setProcessTranscription(!results.isMidSentence);
        }
        console.log("currentTranscription in processQueue:", results);
      } catch (error) {
        console.error("Error processing queue:", error);
      }

      // Prompt check for if the user sounds like they have completed a thought
    }
    setFetchingVoiceTranscription(false);
  }

  const processTextStream = useCallback(
    async function processTextStream(response: Response) {
      async function getTextToVoice(
        priorText: string,
        currentSentence: string,
        voice: string
      ): Promise<AudioBuffer | undefined> {
        if (!currentSentence || currentSentence === "") {
          console.log("No text to process");
          return undefined;
        }

        const response = await fetch("/api/generateVoiceResponse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            previousText: priorText,
            currentSentence,
            voice: voice,
          }),
        });

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        if (!response.body) {
          throw new Error("Response body is undefined");
        }
        try {
          const audioChunks = [];
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            audioChunks.push(value);
          }
          const arrayBuffer = await new Blob(audioChunks).arrayBuffer();
          const audioData = await audioContext.current?.decodeAudioData(
            arrayBuffer
          );
          return audioData;
        } catch (error) {
          console.error("Error processing audio data:", error);
        }
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let processedText = "";
      let completeText = "";

      while (true && reader) {
        if (!audioContext.current) {
          break;
        }
        const { done, value } = await reader.read();

        const textChunk = decoder.decode(value, { stream: true });
        completeText += textChunk;
        const sentences = completeText.match(/(.+?[.:!?\r\n])\s?/gm) || [];
        const message = sentences.join("").replace(processedText, "");
        if (message.length > 20) {
          const audioBuffer = await getTextToVoice(
            processedText,
            message,
            selectedTTSVoice
          );

          if (audioBuffer) {
            audioData.current.push({
              audioBuffer,
              text: message,
            });
            processedText += message;
          }
        }
        console.log("done:", done, "isRecordingStatus:", isRecordingStatus);
        if (done) {
          // TODO: Need to decide if I want truncated text or not, maybe easier to not?
          // Make sure we got the last bit of text in case it doesn't end with a punctuation mark
          // const message = completeText.replace(processedText, '');
          // const audioBuffer = await getTextToVoice(processedText, message, selectedTTSVoice);
          // console.log('Adding to audioToPlay:', new Date() - start);

          // if (audioBuffer) {
          //     audioToPlay.current.push(audioBuffer);
          //     processedText += message;
          // }
          break;
        }

        // For this to work well I need to track which audio is playing and then only use text up to that point
        // if(isRecordingStatus.current) {
        //     // Need to stop playback here
        //     audioContext.current?.close();
        //     audioData.current = [];
        //     const text = spokenText.current;
        //     spokenText.current = '';
        //     return text;
        // }

        console.log(
          "What is textChunk:",
          textChunk,
          "\nWhat is processedText: ",
          processedText
        );
      }
      return processedText;
    },
    [selectedTTSVoice, isRecordingStatus]
  );

  /**
   * Adds the current transcription to the chat and resets the transcription state
   *
   * Accepts the current transcription and adds it to the chat context
   */
  const handleLongSilence = useCallback(
    async function handleLongSilence(t: string): Promise<void> {
      console.log(
        "Long silence detected. Sending full transcription for processing."
      );
      const currentMessage = { role: "user", content: t };
      const response = await fetch("/api/generateTextResponse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: [...chatContext, currentMessage] }),
      });
      // const feedbackResponse = fetch("/api/generateFeedbackResponse", {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({ messages: [...chatContext, currentMessage] }),
      // });
      let processedText = await processTextStream(response);
      if (processedText.trim() === "") {
        // Placeholder until I have a better idea of why an empty string would be generated as a response
        processedText = "...";
      }
      setChatContext([
        ...chatContext,
        currentMessage,
        { role: "assistant", content: processedText },
      ]);
      currentTranscription.current = "";
      // const feedback = await feedbackResponse;
      // const feedbackData = await feedback.json();
      // console.log('Feedback:', feedbackData.text);
      // setFeedback(feedbackData.text);
    },
    [chatContext, processTextStream]
  );

  useEffect(() => {
    // Conditions for recording:
    // - I'm talking
    // - I'm not already recording
    // - I'm not processing the transcript
    // - Nothing is currently playing
    // console.log(
    //   "isRecordingStatus",
    //   isRecordingStatus.current,
    //   "isPlaybackActive",
    //   isPlaybackActive.current,
    //   "blockRecording",
    //   blockRecording.current
    // );
    if (
      isRecordingStatus.current &&
      // mic.current?.state !== 'started' &&
      !isPlaybackActive.current &&
      !blockRecording.current
    ) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [volume, startRecording, isRecordingStatus]);

  useEffect(() => {
    startTranscription();
    return () => {
      stopTranscription();
    };
  }, [startTranscription, stopTranscription]);

  /**
   * Plays the audio data
   *
   * Conditions for playing audio:
   * - Audio data is available
   * - Audio isn't already playing
   * - There is an audio context
   */
  useEffect(() => {
    // TODO: the playbackActiveRef changing might create small gaps where recording could be active

    const playNextAudio = () => {
      if (audioData.current.length > 0 && audioContext.current) {
        console.log(
          "Audio data:",
          audioData.current.length,
          "Playback active:",
          isPlaybackActive.current
        );
        if (isPlaybackActive.current === false) {
          isPlaybackActive.current = true;
          const currentAudioData = audioData.current.shift();
          if (currentAudioData) {
            const player = new Tone.Player(
              currentAudioData.audioBuffer
            ).toDestination();
            player.onstop = () => {
              isPlaybackActive.current = false;
              console.log("Playback ended");
              playNextAudio();
            };
            player.start();
            spokenText.current += currentAudioData.text;
          }
        }
      } else {
        console.log(
          "Audio data:",
          audioData.current.length,
          "Playback active:",
          isPlaybackActive.current
        );
        isPlaybackActive.current = false;
      }
    };

    if (audioData.current.length > 0 && !isPlaybackActive.current) {
      playNextAudio();
    }
  }, [audioData.current.length, audioContext, isPlaybackActive]);

  /********************************************************Data */

  // Get available audio devices
  useEffect(() => {
    async function loadAudioDevices(): Promise<void> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        if (audioInputs.length > 0) {
          setSelectedAudioInput(
            audioInputs.filter((i) => i.label.includes("Default"))[0].deviceId
          );
          setAvailableAudioDevices(audioInputs);
        }
      } catch (error) {
        console.error("Error loading audio devices:", error);
        setAvailableAudioDevices([]);
      }
    }
    loadAudioDevices();
    return () => {
      stopListening();
    };
  }, []);

  // Get available voices from the ElevenLabs API, one call only
  useEffect(() => {
    async function fetchAvailableVoices() {
      const response = await fetch("https://api.elevenlabs.io/v1/voices");
      const data = await response.json();
      const voices = data.voices
        .map((i: { voice_id: string; name: string }) => i.name)
        .sort();
      console.log("Available voices:", voices);
      setAvailableVoices(voices);
      setVoice(voices[0]);
    }
    if (false) {
      setAvailableVoices(OPENAI_VOICES);
      setVoice(OPENAI_VOICES[0]);
    } else {
      fetchAvailableVoices();
    }
  }, []);

  /******************************************************************************Speech to text */
  /**
   * Handles sending the user transcript to the STT API for processing
   *
   * Conditions for sending the transcript:
   * - I've stopped talking long enough (sendTranscript flag)
   * - There is text to process
   * - I'm not 'mid-sentence'
   * - I'm not already processing data
   * - There is no data in the queue (text to voice)
   * - There isn't any TTS audio to play
   *
   * I'm missing something, I can start talking while these condition are true and cause multiple requests
   */
  useEffect(() => {
    async function processTranscript() {
      console.log(
        "processTranscript\n",
        "playbackActive",
        isPlaybackActive.current,
        "Send transcript:",
        processTranscription,
        "Fetching data:",
        fetchingVoiceTranscription,
        "Current transcription:",
        currentTranscription.current.length,
        "Audio data queue:",
        speechToTextDataQueue.current.length
      );
      if (
        !isPlaybackActive.current &&
        !isInMiddleOfSentence.current &&
        processTranscription &&
        !fetchingVoiceTranscription &&
        currentTranscription.current.length > 0 &&
        speechToTextDataQueue.current.length === 0
      ) {
        blockRecording.current = true;
        await handleLongSilence(currentTranscription.current);
        setProcessTranscription(false);
        blockRecording.current = false;
      }
    }
    processTranscript();
  }, [
    processTranscription,
    fetchingVoiceTranscription,
    handleLongSilence,
    setProcessTranscription,
    speechToTextDataQueue,
    isPlaybackActive,
  ]);

  /**
   * Processes the STT data queue
   *
   * Conditions for processing the queue:
   * - There is data in the queue
   * - I'm not already processing data
   */
  useEffect(() => {
    if (
      speechToTextDataQueue.current.length > 0 &&
      !fetchingVoiceTranscription
    ) {
      setFetchingVoiceTranscription(true);
      processQueue();
    }
  }, [speechToTextDataQueue.current.length, fetchingVoiceTranscription]);

  return (
    <div className="p-4 w-full mx-auto flex flex-row">
      <div className="w-1/2 px-40 mt-10">
        <h1 className="text-2xl font-bold mb-4">Audio Recorder Settings</h1>
        <div className="mb-4">
          <label className="block mb-2">Select Audio Input:</label>
          <select
            value={selectedAudioInput}
            onChange={(e) => setSelectedAudioInput(e.target.value)}
            className="w-full p-2 border rounded"
          >
            {availableAudioDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label className="block mb-2">Select Voice:</label>
          <select
            value={selectedTTSVoice}
            onChange={(e) => setVoice(e.target.value)}
            className="w-full p-2 border rounded"
          >
            {availableTTSVoices.map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))}
          </select>
        </div>
        <button
          className={`px-4 py-2 rounded ${
            isListeningStatus ? "bg-red-500" : "bg-green-500"
          } text-white mb-4`}
          onClick={
            isListeningStatus
              ? stopListening
              : () => startListening(selectedAudioInput)
          }
        >
          {isListeningStatus ? "Stop Listening" : "Start Listening"}
        </button>
        <button
          className={`px-4 py-2 rounded bg-blue-500 text-white mb-4 ml-4`}
          onClick={() => {
            setChatContext([]);
            setFeedback("");
          }}
        >
          Reset
        </button>
        <div className="mb-4">
          <label className="block mb-2">
            Current Volume: {volume === -Infinity ? "-∞" : volume.toFixed(2)} dB
          </label>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{
                width: `${Math.max(0, ((volume + 100) / 100) * 100)}%`,
              }}
            ></div>
          </div>
        </div>
        <div className="mb-4">
          <label className="block mb-2">
            Silence Threshold: {silenceThreshold.toFixed(2)} dB
          </label>
          <input
            type="range"
            min="-100"
            max="0"
            value={silenceThreshold}
            readOnly
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setShortSilenceDuration(Number(e.target.value))
            }
            className="w-full"
          />
        </div>
        <div
          className={`p-4 rounded ${
            volume < silenceThreshold ? "bg-red-200" : "bg-green-200"
          }`}
        >
          {volume < silenceThreshold ? "Silence Detected" : "Audio Detected"}
        </div>
        <div
          className={`p-4 rounded mt-4 ${
            isRecordingStatus.current ? "bg-yellow-200" : "bg-gray-200"
          }`}
        >
          Recording Status:{" "}
          {isRecordingStatus.current ? "Recording" : "Not Recording"}
        </div>
      </div>
      <div className="w-1/2">
        {chatContext.map((message, index) => (
          <div key={index}>
            {message.role !== "feedback" ? (
              <p className={`p-2 rounded ${COLOR_MAP[message.role]}`}>
                {message.content}
              </p>
            ) : (
              <Accordion className="w-full">
                <AccordionItem key="1" aria-label="Feedback" title="Feedback">
                  {message.content}
                </AccordionItem>
              </Accordion>
            )}
          </div>
        ))}
        <Accordion className="w-full">
          <AccordionItem key="2" aria-label="Feedback" title="Feedback">
            {feedback}
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

export default AdvancedAudioRecorder;
