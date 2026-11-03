import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import { MyContext } from "./MyContext.jsx";
import { useContext, useState, useRef, useEffect, useMemo } from "react";
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
    const [selectedMode, setSelectedMode] = useState("openai");
    const userKey = authUser?.email || "";
    const userColor = useMemo(() => {
        if (!userKey) return null;
        let hash = 0;
        for (let i = 0; i < userKey.length; i += 1) {
            hash = (hash * 31 + userKey.charCodeAt(i)) % 360;
        }
        return `hsl(${hash} 65% 50%)`;
    }, [userKey]);
    const [localStatus, setLocalStatus] = useState({ reachable: false, model_loaded: false, backend: "none" });
    const [showConsent, setShowConsent] = useState(() => {
        try {
            return !localStorage.getItem("ptmgpt-consent-v1");
        } catch {
            return true;
        }
    });

    const localAvailable = localStatus.reachable && localStatus.model_loaded;

    useEffect(() => {
        let cancelled = false;

        const checkLocal = async () => {
            try {
                const response = await fetch(`${apiBase}/api/ai/status`);
                if (!response.ok) return;
                const data = await response.json();
                if (!cancelled && data?.local) {
                    setLocalStatus(data.local);
                }
            } catch {
                if (!cancelled) {
                    setLocalStatus({ reachable: false, model_loaded: false, backend: "none" });
                }
            }
        };

        checkLocal();
        const timer = setInterval(checkLocal, 15000);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [apiBase]);

    const acceptConsent = () => {
        try {
            localStorage.setItem("ptmgpt-consent-v1", new Date().toISOString());
        } catch {
            // Ignore storage failures; the modal will simply show again next time.
        }
        setShowConsent(false);
    };

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

        if (selectedMode === "biomed" && !localAvailable) {
            setChatError("Local model is not available. Please use Cloud mode or start the local model (see docs/LOCAL_MODEL_SETUP.md).");
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
            // Show failures as a system notice, never as an assistant message.
            setChatError(err.message || "Response failed. Please check backend and AI server.");
            setPrompt(submittedPrompt);
            setImageFile(submittedImageFile);
            setImagePreview(submittedImagePreview);
            setReply(null);
        } finally {
            setLoading(false);
        }
    }

    const handleProfileClick = () => {
        setIsOpen(!isOpen);
        if (isOpen) setShowThemeOptions(false);
    }

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
                        ? (localAvailable
                            ? "Local mode: your text and images are processed by the local model on this machine."
                            : "Local model not available. Use Cloud mode or start the local model.")
                        : "Cloud mode: your text and images are sent to a third-party provider (OpenAI)."}
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
                    Research prototype. Not medical advice. Not a medical device. PtmGPT can make mistakes; check important information with a qualified clinician.
                </p>
            </div>

            {showConsent && (
                <div className="authOverlay" role="dialog" aria-modal="true" aria-labelledby="consentTitle">
                    <div className="authCard">
                        <div className="authBadge">Before you continue</div>
                        <h1 id="consentTitle">This is a research prototype</h1>
                        <p className="authCopy">
                            PtmGPT is not a medical device and does not provide medical advice, diagnosis, prescriptions, or dosages. It can make mistakes. Always consult a qualified clinician for personal medical decisions.
                        </p>
                        <p className="authCopy">
                            <strong>Cloud mode</strong> sends your text and images to a third-party provider (OpenAI). <strong>Local mode</strong> sends them to the local model on this machine, but uploaded images may still be stored on Cloudinary if it is configured.
                        </p>
                        <p className="authCopy">
                            In an emergency, contact your local emergency services immediately. In India, call 112.
                        </p>
                        <button className="authSubmit" type="button" onClick={acceptConsent}>
                            I understand
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ChatWindow;
