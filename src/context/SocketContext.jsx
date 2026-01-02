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

    // -------------------------------------------------------------
    // 👇 FIX: Use Environment Variable instead of Localhost
    // -------------------------------------------------------------
    const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
    
    // Remove "/api" suffix if present (Sockets connect to root, not /api)
    const socketUrl = rawUrl.replace(/\/api\/?$/, ""); 

    console.log("🔌 Creating socket connection to:", socketUrl);

    const s = io(socketUrl, {
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