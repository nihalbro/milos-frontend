import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:3001");

function App() {
  const [myStream, setMyStream] = useState(null);
  const [partnerStream, setPartnerStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [connected, setConnected] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [message, setMessage] = useState("");

  const myVideo = useRef();
  const partnerVideo = useRef();

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      setMyStream(stream);
      myVideo.current.srcObject = stream;
    });

    socket.on("partner-connected", async (partnerId) => {
      setConnected(true);
      const pc = createPeerConnection(partnerId);
      setPeerConnection(pc);
      myStream.getTracks().forEach((track) => {
        pc.addTrack(track, myStream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("signal", { to: partnerId, signal: offer });
    });

    socket.on("signal", async ({ from, signal }) => {
      let pc = peerConnection;
      if (!pc) {
        pc = createPeerConnection(from);
        setPeerConnection(pc);
        myStream.getTracks().forEach((track) => {
          pc.addTrack(track, myStream);
        });
      }

      if (signal.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { to: from, signal: answer });
      } else if (signal.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        try {
          await pc.addIceCandidate(signal);
        } catch (e) {
          console.error(e);
        }
      }
    });

    socket.on("partner-disconnected", () => {
      setConnected(false);
      setPartnerStream(null);
      if (partnerVideo.current) {
        partnerVideo.current.srcObject = null;
      }
      if (peerConnection) {
        peerConnection.close();
      }
    });

    socket.on("typing", () => setPartnerTyping(true));
    socket.on("stop-typing", () => setPartnerTyping(false));
  }, [myStream]);

  const createPeerConnection = (partnerId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("signal", { to: partnerId, signal: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      setPartnerStream(e.streams[0]);
      if (partnerVideo.current) {
        partnerVideo.current.srcObject = e.streams[0];
      }
    };

    return pc;
  };

  const handleSkip = () => {
    if (peerConnection) peerConnection.close();
    setPartnerStream(null);
    if (partnerVideo.current) partnerVideo.current.srcObject = null;
    setConnected(false);
    socket.emit("skip");
  };

  return (
    <div style={{ 
      position: "relative", 
      width: "100vw", 
      height: "100vh", 
      backgroundColor: "#121212", 
      color: "#fff", 
      fontFamily: "Arial, sans-serif",
      overflow: "hidden"
    }}>
      <video
        ref={partnerVideo}
        autoPlay
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: partnerStream ? "none" : "blur(8px)",
          transition: "filter 0.3s",
        }}
      />

      <video
        ref={myVideo}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          width: "220px",
          height: "160px",
          bottom: "100px",
          right: "20px",
          borderRadius: "10px",
          border: "2px solid #ffffff88",
          objectFit: "cover",
          backgroundColor: "#000",
        }}
      />

      {partnerTyping && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            background: "rgba(255, 255, 255, 0.08)",
            padding: "8px 16px",
            borderRadius: "8px",
            color: "#ccc",
            fontSize: "14px",
            backdropFilter: "blur(4px)",
          }}
        >
          Stranger is typing...
        </div>
      )}

      <input
        type="text"
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          socket.emit("typing");
          clearTimeout(window.typingTimeout);
          window.typingTimeout = setTimeout(() => {
            socket.emit("stop-typing");
          }, 1000);
        }}
        placeholder="Type a message..."
        style={{
          position: "absolute",
          bottom: 30,
          left: "50%",
          transform: "translateX(-50%)",
          width: "70%",
          padding: "12px",
          fontSize: "16px",
          borderRadius: "10px",
          border: "1px solid #444",
          backgroundColor: "#1e1e1e",
          color: "#fff",
          outline: "none",
        }}
      />

      <button
        onClick={handleSkip}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          padding: "10px 25px",
          fontSize: "16px",
          backgroundColor: "#ff4d4d",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        Skip
      </button>
    </div>
  );
}

export default App;
