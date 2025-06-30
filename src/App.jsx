import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io(import.meta.env.VITE_BACKEND_URL);

function App() {
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const peerConnection = useRef(null);

  const myVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const handleCallUser = () => {
    peerConnection.current = new RTCPeerConnection();

    myStream.getTracks().forEach(track => {
      peerConnection.current.addTrack(track, myStream);
    });

    peerConnection.current.ontrack = event => {
      const remoteStream = event.streams[0];
      setRemoteStream(remoteStream);
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
      const remoteStream = event.streams[0];
      setRemoteStream(remoteStream);
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
      console.error("Error adding received ice candidate", err);
    }
  };

  useEffect(() => {
    socket.on("user-joined", ({ id }) => {
      setRemoteSocketId(id);
    });

    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("ice-candidate", handleIceCandidate);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setMyStream(stream);
      })
      .catch(err => console.error("Failed to get local stream", err));

    return () => {
      socket.off("user-joined");
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("ice-candidate");
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
    <div className="flex flex-col h-screen bg-black text-white p-4">
      <h1 className="text-2xl font-bold text-center mb-4">Milos - Talk to Strangers</h1>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-2 flex justify-center items-center h-full">
          <video
            className="w-full h-full rounded object-cover"
            ref={myVideoRef}
            autoPlay
            muted
          />
        </div>
        <div className="bg-gray-900 rounded-lg p-2 flex justify-center items-center h-full">
          {remoteStream ? (
            <video
              className="w-full h-full rounded object-cover"
              ref={remoteVideoRef}
              autoPlay
            />
          ) : (
            <p className="text-center">Waiting for a partner...</p>
          )}
        </div>
      </div>

      <div className="mt-4 text-center">
        {remoteSocketId ? (
          <button
            onClick={handleCallUser}
            className="px-6 py-2 bg-blue-600 rounded hover:bg-blue-700"
          >
            Call Stranger
          </button>
        ) : (
          <p>Looking for someone to connect...</p>
        )}
      </div>
    </div>
  );
}

export default App;

