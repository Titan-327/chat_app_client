import { Outlet } from "react-router-dom";

export default function ChatLayout() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Outlet />
    </div>
  );
}
