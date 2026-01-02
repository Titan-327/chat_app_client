import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // 🔴 no user yet → no socket
    if (!user || !user.token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      return;
    }

    // 🔥 prevent duplicate connections (React StrictMode)
    if (socketRef.current) return;

    console.log("🔌 Creating socket connection...");

    const s = io("http://localhost:5000", {
      auth: {
        token: user.token,
      },
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    s.on("connect", () => {
      console.log("🟢 Socket connected:", s.id);
    });

    s.on("connect_error", (err) => {
      console.error("❌ Socket connect error:", err.message);
    });

    s.on("disconnect", (reason) => {
      console.warn("🔴 Socket disconnected:", reason);
    });

    socketRef.current = s;
    setSocket(s);

    return () => {
      console.log("🧹 Cleaning socket");
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [user?.token]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
