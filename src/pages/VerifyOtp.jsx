import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import API from "../api/axios";

export default function VerifyOtp() {
  const { state } = useLocation();
  const navigate = useNavigate();
  
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState(state?.email || "");
  
  // UI States
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" }); // type: 'error' | 'success'

  // If user somehow got here without an email, redirect back
  useEffect(() => {
    if (!email) {
      navigate("/login");
    }
  }, [email, navigate]);

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length < 6) {
      setMessage({ text: "Please enter a valid 6-digit code", type: "error" });
      return;
    }

    setVerifying(true);
    setMessage({ text: "", type: "" });

    try {
      await API.post("/auth/verify-otp", { email, otp });
      
      setMessage({ text: "Verified! Redirecting...", type: "success" });
      
      // Short delay so user sees the success message
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setMessage({ 
        text: err.response?.data?.message || "Invalid OTP. Please try again.", 
        type: "error" 
      });
    } finally {
      setVerifying(false);
    }
  };

  const resendOtp = async () => {
    setResending(true);
    setMessage({ text: "", type: "" });
    
    try {
      await API.post("/auth/resend-otp", { email });
      setMessage({ text: "New code sent to your email.", type: "success" });
    } catch (err) {
      setMessage({ 
        text: err.response?.data?.message || "Failed to resend code.", 
        type: "error" 
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#d1d7db] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Green Header Background Strip */}
      <div className="absolute top-0 w-full h-32 bg-[#00a884] z-0"></div>

      {/* Main Card */}
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md z-10 animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
             <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
             </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-800">Verify your Email</h2>
          <p className="text-gray-500 text-sm mt-2">
            Enter the code we sent to <br/>
            <span className="font-semibold text-gray-700">{email}</span>
          </p>
        </div>

        {/* Message Alert */}
        {message.text && (
          <div className={`text-sm p-3 rounded mb-4 text-center ${
            message.type === 'error' 
              ? 'bg-red-100 text-red-700 border border-red-200' 
              : 'bg-green-100 text-green-700 border border-green-200'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={verifyOtp} className="space-y-6">
          <input
            className="w-full text-center text-3xl tracking-[0.5em] font-semibold text-gray-700 py-3 border-b-2 border-gray-300 focus:border-[#00a884] outline-none transition placeholder-gray-300 bg-transparent"
            placeholder="••••••"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} // Only allow numbers
          />

          <button
            type="submit"
            disabled={verifying}
            className={`w-full py-2.5 rounded font-semibold text-white transition duration-200 
              ${verifying ? "bg-gray-400 cursor-not-allowed" : "bg-[#00a884] hover:bg-[#008f6f] shadow-sm"}`}
          >
            {verifying ? "Verifying..." : "Verify"}
          </button>
        </form>

        {/* Resend Section */}
        <div className="mt-6 text-center text-sm">
          <p className="text-gray-500 mb-2">Didn't receive the code?</p>
          <button
            onClick={resendOtp}
            disabled={resending}
            className={`font-medium ${
              resending ? "text-gray-400" : "text-[#00a884] hover:underline"
            }`}
          >
            {resending ? "Sending..." : "Resend OTP"}
          </button>
        </div>
      </div>
      
      {/* Footer Branding */}
      <div className="mt-8 text-center text-xs text-gray-500 z-10">
        <p>Secure Verification</p>
      </div>
    </div>
  );
}