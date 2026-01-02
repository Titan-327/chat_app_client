import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

// 🔥 1. REUSABLE AVATAR COMPONENT (Handles defaults & errors)
const DEFAULT_PIC = "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg";
const GROUP_PIC = "https://cdn-icons-png.flaticon.com/512/6387/6387947.png";

const Avatar = ({ src, isGroup = false, className }) => (
  <img
    src={src || (isGroup ? GROUP_PIC : DEFAULT_PIC)}
    alt="Avatar"
    onError={(e) => {
      e.target.onerror = null; // Prevent infinite loop
      e.target.src = isGroup ? GROUP_PIC : DEFAULT_PIC;
    }}
    className={`bg-gray-200 object-cover ${className}`}
  />
);

export default function ChatRoom() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();

  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState(null);
  
  // Media states
  const [media, setMedia] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadingGroupPic, setUploadingGroupPic] = useState(false);

  // Modals
  const [showProfile, setShowProfile] = useState(false);
  const [showGroupView, setShowGroupView] = useState(false);
  const [showGroupEdit, setShowGroupEdit] = useState(false);

  const [allUsers, setAllUsers] = useState([]);
  const bottomRef = useRef(null);

  /* ================= FETCH DATA ================= */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [chatRes, msgRes, usersRes] = await Promise.all([
          API.get("/chat"),
          // 🔥 Requesting a high limit since we aren't doing pagination yet
          API.get(`/message/${chatId}?limit=5000`), 
          API.get("/users"),
        ]);

        const currentChat = chatRes.data.find((c) => c._id === chatId);
        setChat(currentChat);
        setMessages(msgRes.data);
        setAllUsers(usersRes.data);

        await API.put("/message/read", { chatId });
        socket?.emit("message:read", { chatId, userId: user._id });
      } catch (err) {
        console.error("Failed to load chat data", err);
      }
    };

    if (chatId && user) fetchData();
  }, [chatId, user, socket]);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  /* ================= SOCKET JOIN ================= */
  useEffect(() => {
    if (!socket) return;
    socket.emit("chat:join", chatId);
    return () => socket.emit("chat:leave", chatId);
  }, [socket, chatId]);

  /* ================= SOCKET LISTENERS ================= */
  useEffect(() => {
    if (!socket) return;

    // 1. Message Events
    socket.on("message:new", (msg) => {
      if (msg.chatId === chatId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
        if (msg.sender._id !== user._id) {
          socket.emit("message:read", { chatId, userId: user._id });
        }
      }
    });

    socket.on("message:read", ({ chatId: cId, userId }) => {
      if (cId !== chatId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.readBy.includes(userId) ? m : { ...m, readBy: [...m.readBy, userId] }
        )
      );
    });

    // 2. Group Events
    socket.on("group:update", (updatedGroup) => {
      if (updatedGroup._id === chatId) {
        setChat(updatedGroup);
      }
    });

    socket.on("group:removed", ({ chatId: removedId }) => {
      if (removedId === chatId) navigate("/chat");
    });

    // 3. User Status & Typing
    socket.on("typing:start", ({ chatId: cId, user: u }) => {
      if (cId === chatId && u._id !== user._id) setTypingUser(u);
    });

    socket.on("typing:stop", () => setTypingUser(null));

    socket.on("user:status", ({ userId, status, lastSeen }) => {
      setChat((prev) => {
        if (!prev) return prev;
        const updatedMembers = prev.members.map((m) =>
          m._id === userId ? { ...m, status, lastSeen } : m
        );
        return { ...prev, members: updatedMembers };
      });
    });

    // 4. User Profile Update
    socket.on("user:update", ({ userId, profilePic }) => {
      setChat((prev) => {
        if (!prev) return prev;
        const updatedMembers = prev.members.map((m) => 
          m._id === userId ? { ...m, profilePic } : m
        );
        return { ...prev, members: updatedMembers };
      });
      
      setMessages(prev => prev.map(msg => 
         msg.sender._id === userId 
         ? { ...msg, sender: { ...msg.sender, profilePic } }
         : msg
      ));
    });

    return () => {
      socket.off("message:new");
      socket.off("message:read");
      socket.off("group:update");
      socket.off("group:removed");
      socket.off("typing:start");
      socket.off("typing:stop");
      socket.off("user:status");
      socket.off("user:update");
    };
  }, [socket, chatId, user._id, navigate]);

  /* ================= SEND MESSAGE ================= */
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !media) return;

    const formData = new FormData();
    formData.append("chatId", chatId);
    if (text.trim()) formData.append("content", text);
    if (media) formData.append("media", media);

    try {
      setText("");
      setMedia(null);
      setMediaPreview(null);
      await API.post("/message", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch (err) {
      console.error(err);
      alert("Message failed");
    }
  };

  const handleMediaChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMedia(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  /* ================= GROUP ACTIONS ================= */
  const addMember = async (userId) => await API.put("/chat/group/add", { chatId, userId });
  const removeMember = async (userId) => await API.put("/chat/group/remove", { chatId, userId });
  const makeAdmin = async (userId) => await API.put("/chat/group/make-admin", { chatId, userId });
  const leaveGroup = async () => {
    await API.put("/chat/group/leave", { chatId, userId: user._id });
    navigate("/chat");
  };

  const handleGroupIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("chatId", chatId);
    formData.append("image", file);

    setUploadingGroupPic(true);
    try {
      await API.put("/chat/group/icon", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch (error) {
      console.error("Group icon upload failed", error);
      alert("Failed to update group icon");
    } finally {
      setUploadingGroupPic(false);
    }
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    socket.emit("typing:start", { chatId, user });
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      socket.emit("typing:stop", { chatId });
    }, 800);
  };

  /* ================= HELPERS ================= */
  const otherUser = chat?.members?.find((m) => m._id !== user._id);
  const isAdmin = chat?.isGroup && chat.admins?.some((a) => a._id === user._id);
  const isOnlyAdmin = isAdmin && chat?.admins?.length === 1;
  const usersNotInGroup = allUsers.filter(
    (u) => chat?.isGroup && !chat.members.some((m) => m._id === u._id)
  );

  /* ================= UI ================= */
  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* HEADER */}
      <div className="flex justify-between items-center p-4 bg-white border-b shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/chat")} className="md:hidden text-gray-600">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          
          {/* 🔥 2. HEADER AVATAR (Replaced img) */}
          <Avatar 
             src={chat?.isGroup ? chat.groupPic : otherUser?.profilePic}
             isGroup={chat?.isGroup}
             className="w-10 h-10 rounded-full border"
          />

          <div>
            <div className="font-semibold text-gray-800">
              {chat?.isGroup ? chat.name : otherUser?.name}
            </div>
            {!chat?.isGroup && otherUser && (
              <div className="text-xs text-gray-500">
                {otherUser.status === "online" ? (
                  <span className="text-green-500 font-medium">Online</span>
                ) : (
                  "Offline"
                )}
              </div>
            )}
            {chat?.isGroup && (
               <div className="text-xs text-gray-500">
                  {chat.members.map(m => m.name).join(", ").slice(0, 30)}...
               </div>
            )}
          </div>
        </div>

        {!chat?.isGroup ? (
          <button onClick={() => setShowProfile(true)} className="text-green-600 text-sm font-medium hover:underline">
            View Profile
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => setShowGroupView(true)} className="text-green-600 text-sm font-medium hover:underline">
              Group Info
            </button>
          </div>
        )}
      </div>

      {/* MESSAGES LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#e5ddd5] custom-scrollbar">
        {messages.map((msg) => {
          const isMe = msg.sender._id === user._id;
          return (
            <div key={msg._id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`px-3 py-2 rounded-lg text-sm max-w-xs shadow-sm relative ${isMe ? "bg-[#d9fdd3] text-gray-800" : "bg-white text-gray-800"}`}>
                {!isMe && chat?.isGroup && (
                  <div className="text-[10px] font-bold text-orange-600 mb-1">{msg.sender.name}</div>
                )}
                <div className="break-words">{msg.content}</div>
                
                {/* Media rendering (remains standard img for actual content) */}
                {msg.type === "image" && <img src={msg.mediaUrl} className="mt-2 rounded-md max-h-60 object-cover" />}
                {msg.type === "video" && <video src={msg.mediaUrl} controls className="mt-2 rounded-md max-h-60" />}
                
                <div className={`text-[10px] mt-1 flex gap-1 items-center ${isMe ? "justify-end" : "justify-start text-gray-400"}`}>
                  <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {isMe && <span className={msg.readBy.length > 1 ? "text-blue-500 font-bold" : "text-gray-500"}>{msg.readBy.length > 1 ? "✔✔" : "✔"}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {typingUser && <div className="text-xs italic text-gray-500 ml-2">{typingUser.name} is typing...</div>}
        <div ref={bottomRef} />
      </div>

      {/* MEDIA PREVIEW */}
      {mediaPreview && (
        <div className="p-3 bg-gray-100 border-t flex justify-between items-center">
          <div className="flex gap-3">
             <img src={mediaPreview} className="h-16 w-16 object-cover rounded border" />
             <div className="text-xs text-gray-500 mt-1">Ready to send</div>
          </div>
          <button onClick={() => { setMedia(null); setMediaPreview(null); }} className="text-red-500">✖</button>
        </div>
      )}

      {/* INPUT */}
      <form onSubmit={sendMessage} className="flex items-center p-3 bg-white border-t gap-2">
        <label className="cursor-pointer text-gray-500 p-2 hover:bg-gray-100 rounded-full">
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
           <input type="file" hidden accept="image/*,video/*" onChange={handleMediaChange} />
        </label>
        <input
          value={text}
          onChange={handleTyping}
          className="flex-1 bg-gray-100 border-none rounded-full px-4 py-2 focus:ring-1 focus:ring-green-500 outline-none"
          placeholder="Type a message"
        />
        <button type="submit" disabled={!text.trim() && !media} className={`p-2 rounded-full ${(!text.trim() && !media) ? 'bg-gray-200 text-gray-400' : 'bg-green-500 text-white'}`}>
           <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </form>

      {/* MODAL: PROFILE VIEW (1-on-1) */}
      {showProfile && otherUser && (
        <Modal onClose={() => setShowProfile(false)}>
          {/* 🔥 3. PROFILE MODAL AVATAR */}
          <Avatar src={otherUser.profilePic} className="w-32 h-32 rounded-full mx-auto border" />
          <div className="text-center mt-3">
             <h2 className="text-xl font-bold">{otherUser.name}</h2>
             <p className="text-gray-500 text-sm">{otherUser.email}</p>
          </div>
        </Modal>
      )}

      {/* MODAL: GROUP VIEW & EDIT */}
      {showGroupView && chat && (
        <Modal onClose={() => { setShowGroupView(false); setShowGroupEdit(false); }}>
          <div className="flex flex-col items-center relative">
             <div className="relative group cursor-pointer">
                {/* 🔥 4. GROUP MODAL AVATAR */}
                <Avatar 
                    src={chat.groupPic} 
                    isGroup={true}
                    className="w-32 h-32 rounded-full border shadow-sm"
                />
                
                {isAdmin && (
                  <label className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-semibold">
                      {uploadingGroupPic ? "..." : "Change"}
                    </span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleGroupIconUpload} disabled={uploadingGroupPic} />
                  </label>
                )}
             </div>

             <h2 className="text-xl font-bold mt-2">{chat.name}</h2>
             <p className="text-gray-500 text-sm mb-4">{chat.members.length} members</p>

             <div className="w-full border-t pt-2">
                <div className="flex justify-between items-center mb-2">
                   <h3 className="font-semibold text-gray-700">Members</h3>
                   {isAdmin && (
                      <button onClick={() => setShowGroupEdit(!showGroupEdit)} className="text-xs text-blue-600 font-semibold uppercase">
                        {showGroupEdit ? "Done" : "Edit Members"}
                      </button>
                   )}
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2">
                  {chat.members.map((m) => (
                    <div key={m._id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                       <div className="flex items-center gap-2">
                          {/* 🔥 5. GROUP MEMBER LIST AVATAR */}
                          <Avatar src={m.profilePic} className="w-8 h-8 rounded-full" />
                          <div>
                             <div className="text-sm font-medium">{m.name} {m._id === user._id && "(You)"}</div>
                             {chat.admins.some((a) => a._id === m._id) && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">Admin</span>}
                          </div>
                       </div>
                       
                       {/* ADMIN ACTIONS */}
                       {showGroupEdit && isAdmin && m._id !== user._id && (
                          <div className="flex gap-2">
                             {!chat.admins.some((a) => a._id === m._id) && (
                                <button onClick={() => makeAdmin(m._id)} className="text-xs text-blue-600 hover:underline">Promote</button>
                             )}
                             <button onClick={() => removeMember(m._id)} className="text-xs text-red-500 hover:underline">Remove</button>
                          </div>
                       )}
                    </div>
                  ))}
                </div>

                {/* ADD MEMBERS */}
                {showGroupEdit && (
                   <div className="mt-4 border-t pt-2">
                      <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Add Participants</div>
                      <div className="max-h-32 overflow-y-auto">
                         {usersNotInGroup.map((u) => (
                            <button key={u._id} onClick={() => addMember(u._id)} className="flex items-center gap-2 w-full p-2 hover:bg-green-50 rounded text-left">
                               {/* 🔥 6. ADD MEMBER LIST AVATAR */}
                               <Avatar src={u.profilePic} className="w-6 h-6 rounded-full" />
                               <span className="text-sm text-gray-700">{u.name}</span>
                               <span className="ml-auto text-green-600 font-bold">+</span>
                            </button>
                         ))}
                         {usersNotInGroup.length === 0 && <div className="text-xs text-gray-400 italic">No other users to add</div>}
                      </div>
                   </div>
                )}
             </div>

             {!isOnlyAdmin && !showGroupEdit && (
                <button onClick={leaveGroup} className="mt-6 w-full py-2 text-red-600 border border-red-200 rounded hover:bg-red-50 text-sm font-semibold">
                   Exit Group
                </button>
             )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= SIMPLE MODAL ================= */
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm relative shadow-2xl animate-fade-in">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-black z-10">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="p-6">
           {children}
        </div>
      </div>
    </div>
  );
}