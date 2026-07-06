import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useRef, useEffect } from "react";
import UpgradeModal from "./UpgradeModal.jsx";
import "./UpgradeModal.css";

function ChatWindow({ onToggleSidebar }) {
    const {
        prompt, setPrompt, setReply, currThreadId, setPrevChats, setNewChat,
        themePreference, setThemePreference, authUser, setAuthUser, apiBase, openAuthModal,
        handleLogout, handleSessionExpired
    } = useContext(MyContext);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [showThemeOptions, setShowThemeOptions] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [chatError, setChatError] = useState("");
    const [userColor, setUserColor] = useState(null);
    const [selectedMode, setSelectedMode] = useState("openai");
    
    // Image Upload States
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const fileInputRef = useRef(null);

    // Handle Image Selection
    const handleImageChange = (e) => {
        if (!authUser) {
            openAuthModal?.("login", "Please login or sign up before uploading an image.");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const removeImage = () => {
        setImageFile(null);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const getReply = async () => {
        if (!prompt.trim() && !imageFile) return;

        if (!authUser) {
            openAuthModal?.("login", "Please login or sign up before sending your first message.");
            return;
        }

        if (authUser.plan === "free" && authUser.freeChatsRemaining <= 0) {
            setChatError("Aapki free 28 chats khatam ho chuki hain. Upgrade karke aage baat karein.");
            setShowUpgradeModal(true);
            return;
        }

        const submittedPrompt = prompt.trim();
        const submittedImagePreview = imagePreview;
        const submittedImageFile = imageFile;
        const userMessage = {
            role: "user",
            content: submittedPrompt || "Uploaded Image",
            imageUrl: submittedImagePreview
        };

        setLoading(true);
        setNewChat(false);
        setReply(null);
        setPrevChats(prevChats => [...prevChats, userMessage]);

        // Create FormData for Text + Image
        const formData = new FormData();
        formData.append("threadId", currThreadId);
        formData.append("mode", selectedMode);
        if (submittedPrompt) formData.append("message", submittedPrompt);
        if (imageFile) formData.append("image", imageFile);

        // Clear UI inputs immediately for good UX
        setPrompt("");
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";

        try {
            // Send request to backend
            const response = await fetch(`${apiBase}/api/chat`, {
                method: "POST",
                credentials: "include",
                body: formData // No Content-Type needed, browser sets multipart/form-data
            });
            const res = await response.json();
            if (response.status === 401) {
                handleSessionExpired?.();
                throw new Error(res.error || "Session expired");
            }
            if (response.status === 402) {
                setChatError(res.error || "Aapki free chat limit khatam ho gayi hai. Upgrade karein.");
                setShowUpgradeModal(true);
                throw new Error(res.error || "Payment required");
            }
            if (!response.ok) {
                throw new Error(res.error || "Request failed");
            }
            
            // Backend se aayi hui final image URL (agar ho) hum UI me update kar sakte hain
            const finalImageUrl = res.imageUrl
                ? new URL(res.imageUrl, apiBase).href
                : submittedImagePreview;
            
            if (res.user) {
                setAuthUser(res.user);
            }
            setChatError("");
            setReply(res.reply);
            setPrevChats(prevChats => {
                const updatedChats = [...prevChats];
                const lastUserIndex = updatedChats.findLastIndex(chat => chat.role === "user");

                if (lastUserIndex !== -1) {
                    updatedChats[lastUserIndex] = {
                        ...updatedChats[lastUserIndex],
                        imageUrl: finalImageUrl
                    };
                }

                return [...updatedChats, {
                    role: "assistant",
                    content: res.reply
                }];
            });
        } catch(err) {
            console.log(err);
            if (!chatError) {
                setChatError(err.message || "Response failed. Please check backend and AI server.");
            }
            setPrompt(submittedPrompt);
            setImageFile(submittedImageFile);
            setImagePreview(submittedImagePreview);
            setReply(null);
            setPrevChats(prevChats => [
                ...prevChats,
                {
                    role: "assistant",
                    content: err.message || "Response failed. Please check backend and AI server.",
                    isError: true
                }
            ]);
        } finally {
            setLoading(false);
        }
    }

    const handleProfileClick = () => {
        setIsOpen(!isOpen);
        if (isOpen) setShowThemeOptions(false);
    }

    useEffect(() => {
        if (authUser) {
            const hue = Math.floor(Math.random() * 360);
            const color = `hsl(${hue} 65% 50%)`;
            setUserColor(color);
        } else {
            setUserColor(null);
        }
    }, [authUser]);

    const handleThemeChange = (theme) => {
        setThemePreference(theme);
        setShowThemeOptions(false);
        setIsOpen(false);
    }

    const onLogout = () => {
        handleLogout?.();
        setShowThemeOptions(false);
        setIsOpen(false);
    }

    return (
        <div className="chatWindow">
            <div className="navbar">
                <div className="navStart">
                    <button
                        type="button"
                        className="sidebarMenuBtn"
                        aria-label="Open sidebar"
                        onClick={onToggleSidebar}
                    >
                        <i className="fa-solid fa-bars"></i>
                    </button>
                    <div className="appBrand">
                        <span>PtmGPT</span>
                    </div>
                </div>
                <div className="userIconDiv" onClick={handleProfileClick}>
                    {authUser ? (
                        <span
                            className="userIcon userInitial"
                            style={{ backgroundColor: userColor }}
                            title={authUser.name || authUser.email || "User"}
                        >
                            {(authUser.name || authUser.email || "?").charAt(0).toUpperCase()}
                        </span>
                    ) : (
                        <span className="userIcon"><i className="fa-solid fa-user"></i></span>
                    )}
                </div>
            </div>
            {
                isOpen && 
                <div className="dropDown">
                    <div className="dropDownItem" onClick={() => setShowThemeOptions(prev => !prev)}>
                        <span><i className="fa-solid fa-gear"></i> Settings</span>
                        <i className={`fa-solid fa-chevron-${showThemeOptions ? "up" : "down"}`}></i>
                    </div>
                    {
                        showThemeOptions &&
                        <div className="themeOptions">
                            <button
                                type="button"
                                className={`themeOption ${themePreference === "system" ? "selected" : ""}`}
                                onClick={() => handleThemeChange("system")}
                            >
                                <i className="fa-solid fa-desktop"></i>
                                System default
                            </button>
                            <button
                                type="button"
                                className={`themeOption ${themePreference === "light" ? "selected" : ""}`}
                                onClick={() => handleThemeChange("light")}
                            >
                                <i className="fa-solid fa-sun"></i>
                                Light mode
                            </button>
                            <button
                                type="button"
                                className={`themeOption ${themePreference === "dark" ? "selected" : ""}`}
                                onClick={() => handleThemeChange("dark")}
                            >
                                <i className="fa-solid fa-moon"></i>
                                Dark mode
                            </button>
                        </div>
                    }
                    <div
                        className="dropDownItem"
                        onClick={() => {
                            setShowUpgradeModal(true);
                            setIsOpen(false);
                        }}
                    >
                        <i className="fa-solid fa-cloud-arrow-up"></i> Upgrade plan
                    </div>
                    {authUser ? (
                        <div className="dropDownItem" onClick={onLogout}>
                            <i className="fa-solid fa-arrow-right-from-bracket"></i> Log out
                        </div>
                    ) : (
                        <div
                            className="dropDownItem"
                            onClick={() => {
                                openAuthModal?.("login");
                                setIsOpen(false);
                            }}
                        >
                            <i className="fa-solid fa-arrow-right-to-bracket"></i> Login
                        </div>
                    )}
                </div>
            }

            <Chat></Chat>

            {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}

            {loading && <div className="loader" aria-label="Loading"></div>}
            {chatError && <div className="chatErrorMessage">{chatError}</div>}
            <div className="chatInput">
                {imagePreview && (
                    <div className="inputImagePreview">
                        <div className="imageThumb">
                            <img src={imagePreview} alt="Preview" />
                        </div>
                        <div className="imageDetails">
                            <div className="imageLabel">Image attached</div>
                            <div className="imageHint">Upload will appear in chat when sent.</div>
                        </div>
                        <button className="removeImageBtn" onClick={removeImage}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}

                <div className="modeSwitch" role="tablist" aria-label="AI mode selector">
                    <button
                        type="button"
                        className={`modeOption ${selectedMode === "openai" ? "active" : ""}`}
                        onClick={() => setSelectedMode("openai")}
                    >
                        OpenAI
                    </button>
                    <button
                        type="button"
                        className={`modeOption ${selectedMode === "biomed" ? "active" : ""}`}
                        onClick={() => setSelectedMode("biomed")}
                    >
                        BioMed
                    </button>
                </div>
                <p className="modeHint">
                    {selectedMode === "biomed"
                        ? "BioMed mode for medical questions."
                        : "OpenAI mode for general questions and everyday chat."}
                </p>
                <div className="inputBox">
                    <input 
                        type="file" 
                        accept="image/*" 
                        hidden 
                        ref={fileInputRef} 
                        onChange={handleImageChange} 
                    />
                    <div
                        className="uploadIcon"
                        onClick={() => {
                            if (!authUser) {
                                openAuthModal?.("login", "Please login or sign up before uploading an image.");
                                return;
                            }
                            fileInputRef.current.click();
                        }}
                    >
                        <i className="fa-solid fa-plus"></i>
                    </div>

                    <input placeholder={selectedMode === "biomed" ? "Ask a medical question or upload image" : "Ask anything or upload image"}
                        value={prompt}
                        className="textInputField"
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter'? getReply() : ''}
                    />

                    <div id="submit" onClick={getReply}><i className="fa-solid fa-paper-plane"></i></div>
                </div>

                <p className="info">
                    PtmGPT can make mistakes. Check important info. See Cookie Preferences.
                </p>
            </div>
        </div>
    )
}

export default ChatWindow;
