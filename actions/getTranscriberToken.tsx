'use server'

import { AssemblyAI } from "assemblyai";
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

export default async function getTranscriberToken(): Promise<string> {
  if (!ASSEMBLYAI_API_KEY) {
    throw new Error("ASSEMBLYAI_API_KEY is not set");
  }

  const client = new AssemblyAI({
    apiKey: ASSEMBLYAI_API_KEY,
  });

  const token = client.realtime.createTemporaryToken({ expires_in: 3600 });
  return token;
}
