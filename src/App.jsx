import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io(import.meta.env.VITE_BACKEND_URL);

function App() {
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [typing, setTyping] = useState(false);
  const [strangerTyping, setStrangerTyping] = useState(false);

  const peerConnection = useRef(null);
  const myVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const typingTimeout = useRef(null);

  const callUser = () => {
    peerConnection.current = new RTCPeerConnection();

    myStream.getTracks().forEach(track => {
      peerConnection.current.addTrack(track, myStream);
    });

    peerConnection.current.ontrack = event => {
      const stream = event.streams[0];
      setRemoteStream(stream);
    };

    peerConnection.current.onicecandidate = event => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          candidate: event.candidate,
          to: remoteSocketId,
        });
      }
    };

    peerConnection.current
      .createOffer()
      .then(offer => {
        peerConnection.current.setLocalDescription(offer);
        socket.emit("call-user", { offer, to: remoteSocketId });
      });
  };

  const handleIncomingCall = async ({ from, offer }) => {
    setRemoteSocketId(from);
    peerConnection.current = new RTCPeerConnection();

    myStream.getTracks().forEach(track => {
      peerConnection.current.addTrack(track, myStream);
    });

    peerConnection.current.ontrack = event => {
      const stream = event.streams[0];
      setRemoteStream(stream);
    };

    peerConnection.current.onicecandidate = event => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          candidate: event.candidate,
          to: from,
        });
      }
    };

    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);
    socket.emit("answer-call", { answer, to: from });
  };

  const handleCallAccepted = async ({ answer }) => {
    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleIceCandidate = async ({ candidate }) => {
    try {
      await peerConnection.current.addIceCandidate(candidate);
    } catch (err) {
      console.error("Error adding ice candidate", err);
    }
  };

  const handleSkip = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    setRemoteSocketId(null);
    setRemoteStream(null);
    socket.emit("rejoin");
  };

  const handleTyping = () => {
    setTyping(true);
    socket.emit("typing", { to: remoteSocketId });

    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      setTyping(false);
      socket.emit("stop-typing", { to: remoteSocketId });
    }, 1000);
  };

  useEffect(() => {
    socket.on("user-joined", ({ id }) => {
      setRemoteSocketId(id);
    });

    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("ice-candidate", handleIceCandidate);

    socket.on("partner-disconnected", () => {
      setRemoteSocketId(null);
      setRemoteStream(null);
    });

    socket.on("stranger-typing", () => setStrangerTyping(true));
    socket.on("stranger-stop-typing", () => setStrangerTyping(false));

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setMyStream(stream);
      })
      .catch(err => console.error("getUserMedia error:", err));

    return () => {
      socket.off("user-joined");
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("ice-candidate");
      socket.off("partner-disconnected");
      socket.off("stranger-typing");
      socket.off("stranger-stop-typing");
    };
  }, []);

  useEffect(() => {
    if (myVideoRef.current && myStream) {
      myVideoRef.current.srcObject = myStream;
    }
  }, [myStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white p-4">
      <h1 className="text-2xl font-bold text-center mb-4">🎥 Milos — Chat with Strangers</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        <div className="bg-gray-800 rounded-xl p-2 flex justify-center items-center">
          <video className="w-full h-full object-cover rounded-xl" ref={myVideoRef} autoPlay muted />
        </div>
        <div className="bg-gray-800 rounded-xl p-2 flex justify-center items-center relative">
          {remoteStream ? (
            <>
              <video className="w-full h-full object-cover rounded-xl" ref={remoteVideoRef} autoPlay />
              {strangerTyping && (
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-3 py-1 rounded text-sm">
                  Stranger is typing...
                </div>
              )}
            </>
          ) : (
            <p>Waiting for a partner...</p>
          )}
        </div>
      </div>

      <div className="mt-4 text-center space-x-4">
        {remoteSocketId ? (
          <>
            <button onClick={callUser} className="bg-blue-600 px-5 py-2 rounded hover:bg-blue-700">Call</button>
            <button onClick={handleSkip} className="bg-red-600 px-5 py-2 rounded hover:bg-red-700">Skip</button>
          </>
        ) : (
          <p>Looking for someone to connect...</p>
        )}
      </div>

      {remoteSocketId && (
        <div className="mt-6 text-center">
          <input
            type="text"
            placeholder="Say something..."
            onChange={handleTyping}
            className="px-4 py-2 w-full max-w-md text-black rounded"
          />
        </div>
      )}
    </div>
  );
}

export default App;
