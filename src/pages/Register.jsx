import { useState } from "react";
import API from "../api/axios";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if(!form.name || !form.email || !form.password) {
        setError("Please fill in all fields");
        return;
    }

    setLoading(true);
    setError("");

    try {
      await API.post("/auth/register", form);
      // Pass email to verify page so user doesn't have to retype it
      navigate("/verify-otp", { state: { email: form.email } });
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#d1d7db] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Green Header Background Strip (WhatsApp Style) */}
      <div className="absolute top-0 w-full h-32 bg-[#00a884] z-0"></div>

      {/* Main Card */}
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md z-10 animate-fade-in-up">
        {/* Logo / Header */}
        <div className="flex flex-col items-center mb-6">
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" 
            alt="WhatsApp" 
            className="w-12 h-12 mb-3"
          />
          <h2 className="text-2xl font-semibold text-gray-800">Create an Account</h2>
          <p className="text-gray-500 text-sm mt-1">Join the community today</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 mb-4 text-sm rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase mb-1 ml-1">Full Name</label>
            <input
              className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition"
              placeholder="e.g. John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase mb-1 ml-1">Email Address</label>
            <input
              className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition"
              type="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase mb-1 ml-1">Password</label>
            <input
              className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#00a884] focus:border-transparent outline-none transition"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 rounded font-semibold text-white transition duration-200 
              ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-[#00a884] hover:bg-[#008f6f] shadow-sm"}`}
          >
            {loading ? "Creating Account..." : "Register"}
          </button>
        </form>

        {/* Footer Link */}
        <div className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="text-[#00a884] font-medium hover:underline">
            Log in
          </Link>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="mt-8 text-center text-xs text-gray-500 z-10">
        <p>From</p>
        <p className="font-bold">Chat App</p>
      </div>
    </div>
  );
}