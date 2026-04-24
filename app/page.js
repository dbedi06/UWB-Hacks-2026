"use client";
import dynamic from "next/dynamic";
const VoiceMap = dynamic(() => import("../components/VoiceMap"), { ssr: false });
export default function Home() { return <VoiceMap />; }