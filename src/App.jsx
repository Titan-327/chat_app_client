import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext"; // Import useAuth
import { SocketProvider } from "./context/SocketContext"; // Import SocketProvider

import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyOtp from "./pages/VerifyOtp.jsx";
import ProtectedRoute from "./components/ProtectedRoute";
import ChatLayout from "./pages/ChatLayout";
import ChatListPage from "./pages/ChatListPage";
import ChatRoom from "./pages/ChatRoom";

export default function App() {
  const { user } = useAuth(); // Get current user status

  return (
    <BrowserRouter>
      <Routes>
        {/* 🔥 LANDING ROUTE LOGIC: 
            If user exists -> Go to Chat
            If no user -> Go to Login 
        */}
        <Route 
          path="/" 
          element={<Navigate to={user ? "/chat" : "/login"} replace />} 
        />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />

        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              {/* 🔥 Socket connects ONLY when user is logged in */}
              <SocketProvider>
                <ChatLayout />
              </SocketProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<ChatListPage />} />
          <Route path=":chatId" element={<ChatRoom />} />
        </Route>

        {/* Catch-all for 404s */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}