import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

// Icons
const SearchIcon = () => <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const CameraIcon = () => <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

// 🔥 REUSABLE AVATAR COMPONENT (Handles default image logic)
const DEFAULT_PIC = "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg";
const GROUP_PIC = "https://cdn-icons-png.flaticon.com/512/6387/6387947.png"; // Nice default for groups

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

export default function ChatListPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();

  const [chats, setChats] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [userStatus, setUserStatus] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  // UI States
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Group Create States
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  
  // Profile Upload State
  const [uploading, setUploading] = useState(false);

  /* ================= HELPERS ================= */

  const formatTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const isToday = new Date().toDateString() === date.toDateString();
    return isToday 
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString();
  };

  const sortChats = (list) =>
    [...list].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return new Date(bTime) - new Date(aTime);
    });

  const upsertChat = (prev, incoming) => {
    const exists = prev.find((c) => c._id === incoming._id);
    if (exists) {
      return sortChats(prev.map((c) => (c._id === incoming._id ? incoming : c)));
    }
    return sortChats([incoming, ...prev]);
  };

  /* ================= FETCH DATA ================= */

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [chatRes, userRes] = await Promise.all([
          API.get("/chat"),
          API.get("/users"),
        ]);
        setChats(sortChats(chatRes.data));
        setAllUsers(userRes.data.filter((u) => u._id !== user._id));
        
        // Init Status
        const statusMap = {};
        userRes.data.forEach((u) => {
          statusMap[u._id] = { status: u.status || "offline", lastSeen: u.lastSeen };
        });
        setUserStatus(statusMap);
      } catch (err) {
        console.error("Data load failed", err);
      }
    };
    if (user?._id) fetchData();
  }, [user._id]);

  /* ================= SOCKET LOGIC ================= */

  useEffect(() => {
    if (!socket) return;

    // 1. Status Updates
    const onStatus = ({ userId, status, lastSeen }) => {
      setUserStatus((prev) => ({ ...prev, [userId]: { status, lastSeen } }));
    };

    // 2. Chat Events
    const onChatNew = (chat) => setChats((prev) => upsertChat(prev, chat));
    
    const onChatUpdate = ({ chatId, lastMessage, unreadCount }) => {
      setChats((prev) =>
        sortChats(
          prev.map((c) =>
            c._id === chatId
              ? {
                  ...c,
                  lastMessage: lastMessage ?? c.lastMessage,
                  unreadCount:
                    unreadCount !== undefined
                      ? { ...c.unreadCount, [user._id]: unreadCount }
                      : c.unreadCount,
                }
              : c
          )
        )
      );
    };

    const onGroupRemoved = ({ chatId }) => {
      setChats((prev) => prev.filter((c) => c._id !== chatId));
    };

    // 3. User Profile Updates
    const onUserUpdate = ({ userId, profilePic }) => {
      setAllUsers((prev) => 
        prev.map((u) => u._id === userId ? { ...u, profilePic } : u)
      );

      setChats((prev) => 
        prev.map((chat) => {
          if (chat.isGroup) return chat; 
          const isMember = chat.members.some(m => m._id === userId);
          if (isMember) {
             const updatedMembers = chat.members.map(m => 
                m._id === userId ? { ...m, profilePic } : m
             );
             return { ...chat, members: updatedMembers };
          }
          return chat;
        })
      );
    };

    socket.on("user:status", onStatus);
    socket.on("chat:new", onChatNew);
    socket.on("group:update", onChatNew);
    socket.on("chat:update", onChatUpdate);
    socket.on("group:removed", onGroupRemoved);
    socket.on("user:update", onUserUpdate); 

    return () => {
      socket.off("user:status", onStatus);
      socket.off("chat:new", onChatNew);
      socket.off("group:update", onChatNew);
      socket.off("chat:update", onChatUpdate);
      socket.off("group:removed", onGroupRemoved);
      socket.off("user:update", onUserUpdate);
    };
  }, [socket, user._id]);

  /* ================= HANDLERS ================= */

  const openChat = (chatId) => {
    setChats((prev) =>
      prev.map((c) =>
        c._id === chatId ? { ...c, unreadCount: { ...c.unreadCount, [user._id]: 0 } } : c
      )
    );
    navigate(`/chat/${chatId}`);
  };

  const openUserChat = async (userId) => {
    const { data } = await API.post("/chat", { userId });
    setChats((prev) => upsertChat(prev, data));
    navigate(`/chat/${data._id}`);
  };

  const createGroup = async () => {
    if (!groupName || selectedUsers.length < 2) return;
    await API.post("/chat/group", { name: groupName, members: selectedUsers });
    setShowGroupModal(false);
    setGroupName("");
    setSelectedUsers([]);
  };

  const handleProfileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    setUploading(true);
    try {
      const { data } = await API.put("/users/profile-pic", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUser(data); 
      setShowProfileModal(false);
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setUploading(false);
    }
  };

  /* ================= DERIVED ================= */

  const chatUserIds = new Set();
  chats.forEach((chat) => {
    if (!chat.isGroup) {
      chat.members.forEach((m) => {
        if (m._id !== user._id) chatUserIds.add(m._id);
      });
    }
  });

  const availableUsers = allUsers.filter((u) => !chatUserIds.has(u._id));
  
  const filteredChats = chats.filter(chat => {
    const name = chat.isGroup 
      ? chat.name 
      : chat.members.find(m => m._id !== user._id)?.name || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  /* ================= RENDER ================= */

  return (
    <div className="flex justify-center bg-[#d1d7db] min-h-screen">
      <div className="w-full max-w-md bg-white shadow-lg h-screen flex flex-col relative overflow-hidden">
        
        {/* === HEADER (Teal) === */}
        <div className="bg-[#008069] p-4 flex justify-between items-center text-white shadow-sm z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowProfileModal(true)} className="relative group">
              {/* 🔥 Header Avatar */}
              <Avatar 
                src={user?.profilePic} 
                className="w-10 h-10 rounded-full border-2 border-transparent group-hover:border-white transition"
              />
            </button>
            <h1 className="text-xl font-bold tracking-wide">WhatsApp</h1>
          </div>
          
          <div className="flex gap-4">
            <button onClick={() => setShowGroupModal(true)} title="New Group">
              <svg className="w-6 h-6 opacity-80 hover:opacity-100" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
            </button>
          </div>
        </div>

        {/* === SEARCH BAR === */}
        <div className="p-2 bg-white border-b">
          <div className="flex items-center bg-[#f0f2f5] rounded-lg px-3 py-1.5">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search or start new chat"
              className="bg-transparent border-none outline-none ml-3 w-full text-sm text-gray-700 placeholder-gray-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* === CHAT LIST === */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Active Chats */}
          {filteredChats.map((chat) => {
            const unread = chat.unreadCount?.[user._id] || 0;
            const other = !chat.isGroup
              ? chat.members.find((m) => m._id !== user._id)
              : null;
            
            const chatName = chat.isGroup ? chat.name : other?.name;
            // Avatar source handling moved to component below
            
            return (
              <div
                key={chat._id}
                onClick={() => openChat(chat._id)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#f5f6f6] border-b border-gray-100 transition"
              >
                {/* Avatar */}
                <div className="relative">
                  {/* 🔥 List Item Avatar */}
                  <Avatar 
                    src={chat.isGroup ? chat.groupPic : other?.profilePic}
                    isGroup={chat.isGroup}
                    className="w-12 h-12 rounded-full"
                  />
                  {!chat.isGroup && userStatus[other?._id]?.status === "online" && (
                     <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-[#111b21] font-medium truncate">{chatName}</h3>
                    <span className={`text-xs ${unread > 0 ? 'text-[#25d366] font-semibold' : 'text-gray-500'}`}>
                      {formatTime(chat.lastMessage?.createdAt)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center mt-0.5">
                    <p className="text-sm text-gray-500 truncate w-11/12">
                      {chat.lastMessage?.type === 'image' && '📷 Photo'} 
                      {chat.lastMessage?.type === 'video' && '🎥 Video'} 
                      {chat.lastMessage?.type === 'text' && chat.lastMessage.content}
                      {!chat.lastMessage && <span className="italic text-xs">No messages yet</span>}
                    </p>
                    {unread > 0 && (
                      <span className="bg-[#25d366] text-white text-xs font-bold px-1.5 min-w-[1.2rem] h-[1.2rem] flex items-center justify-center rounded-full">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Users to Start Chat With */}
          {availableUsers.length > 0 && (
             <div className="mt-4 px-4 pb-2">
                <h3 className="text-[#008069] text-xs font-bold uppercase tracking-wider mb-2">Start a new chat</h3>
                {availableUsers.map((u) => (
                  <div key={u._id} onClick={() => openUserChat(u._id)} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-[#f5f6f6]">
                    {/* 🔥 Start Chat Avatar */}
                    <Avatar src={u.profilePic} className="w-10 h-10 rounded-full" />
                    <div>
                      <div className="text-[#111b21] font-medium">{u.name}</div>
                      <div className="text-xs text-gray-500">{userStatus[u._id]?.status === 'online' ? 'Online' : 'Offline'}</div>
                    </div>
                  </div>
                ))}
             </div>
          )}
        </div>

        {/* === FLOAT ACTION BUTTON === */}
        <button 
           className="absolute bottom-6 right-6 bg-[#008069] text-white p-3.5 rounded-full shadow-lg hover:bg-[#006e5a] transition"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M18 13v5a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h5M15 3h6m0 0v6m0-6L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>

        {/* === PROFILE MODAL === */}
        {showProfileModal && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col animate-slide-in-right">
             <div className="bg-[#008069] p-4 text-white flex items-center gap-4">
                <button onClick={() => setShowProfileModal(false)}>
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <h2 className="text-lg font-semibold">Profile</h2>
             </div>

             <div className="flex-1 bg-[#f0f2f5] flex flex-col items-center pt-8">
                <div className="relative group">
                   {/* 🔥 Big Profile Avatar */}
                   <Avatar 
                      src={user.profilePic} 
                      className="w-40 h-40 rounded-full border-4 border-white shadow-sm" 
                   />
                   <label className="absolute bottom-2 right-2 bg-[#008069] p-2 rounded-full cursor-pointer hover:bg-[#006e5a] text-white shadow-md">
                      <CameraIcon />
                      <input type="file" className="hidden" accept="image/*" onChange={handleProfileUpload} disabled={uploading} />
                   </label>
                   {uploading && <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center text-white text-xs">Updating...</div>}
                </div>

                <div className="w-full mt-8 px-4">
                   <div className="bg-white p-4 shadow-sm mb-4">
                      <label className="text-[#008069] text-sm font-semibold">Your Name</label>
                      <div className="text-gray-800 text-lg mt-1">{user.name}</div>
                   </div>
                   <div className="bg-white p-4 shadow-sm">
                      <label className="text-[#008069] text-sm font-semibold">Email</label>
                      <div className="text-gray-800 text-lg mt-1">{user.email}</div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* === GROUP MODAL === */}
        {showGroupModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-lg shadow-xl overflow-hidden">
               <div className="bg-[#008069] p-4 text-white">
                  <h3 className="font-semibold text-lg">New Group</h3>
               </div>
               <div className="p-4">
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Group Subject"
                    className="w-full border-b-2 border-[#008069] py-1 mb-4 focus:outline-none"
                  />
                  <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Select Participants</div>
                  <div className="h-40 overflow-y-auto border rounded p-2 bg-gray-50">
                     {allUsers.map((u) => (
                        <label key={u._id} className="flex items-center gap-3 p-2 hover:bg-white rounded cursor-pointer">
                           <input 
                              type="checkbox" 
                              className="accent-[#008069]"
                              checked={selectedUsers.includes(u._id)}
                              onChange={() => setSelectedUsers(prev => prev.includes(u._id) ? prev.filter(id => id !== u._id) : [...prev, u._id])}
                           />
                           {/* 🔥 Group Member List Avatar */}
                           <Avatar src={u.profilePic} className="w-8 h-8 rounded-full" />
                           <span>{u.name}</span>
                        </label>
                     ))}
                  </div>
                  <div className="flex justify-end gap-3 mt-4">
                     <button onClick={() => setShowGroupModal(false)} className="text-[#008069] font-medium px-4 py-2 hover:bg-green-50 rounded">Cancel</button>
                     <button onClick={createGroup} className="bg-[#008069] text-white px-4 py-2 rounded shadow hover:bg-[#006e5a]">Create</button>
                  </div>
               </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}