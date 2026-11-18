import "./Chat.css";
import { useContext, useRef, useEffect, useState } from "react";
import { MyContext } from "./MyContext";

const isImageUrl = (url) => (
    typeof url === "string"
    && (url.startsWith("blob:") || /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(url))
);

const svgProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "icon",
    "aria-hidden": true,
    focusable: "false"
};

const EditIcon = () => (
    <svg {...svgProps}><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);

const RetryIcon = () => (
    <svg {...svgProps}>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
    </svg>
);

const TrashIcon = () => (
    <svg {...svgProps}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v5M14 11v5" />
    </svg>
);

const CopyIcon = () => (
    <svg {...svgProps}>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
);

const CheckIcon = () => (
    <svg {...svgProps}><path d="M20 6 9 17l-5-5" /></svg>
);

const CloseIcon = () => (
    <svg {...svgProps}><path d="M18 6 6 18M6 6l12 12" /></svg>
);

const FileIcon = () => (
    <svg {...svgProps}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M12 11v6M9 14h6" />
    </svg>
);

function Chat() {
    const {
        newChat, prevChats, setPrevChats, currThreadId, apiBase, handleSessionExpired
    } = useContext(MyContext);
    const chatsContainerRef = useRef(null);
    const copyTimerRef = useRef(null);
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [actionError, setActionError] = useState("");
    const [copiedId, setCopiedId] = useState(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (chatsContainerRef.current) {
            const scrollContainer = chatsContainerRef.current;
            // Small delay to ensure DOM has updated
            setTimeout(() => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }, 0);
        }
    }, [prevChats]);

    useEffect(() => () => {
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    }, []);

    const sendRequest = async (url, options) => {
        const response = await fetch(url, { credentials: "include", ...options });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            handleSessionExpired?.();
            throw new Error(data.error || "Session expired");
        }
        if (!response.ok) {
            throw new Error(data.error || "Request failed");
        }

        return data;
    };

    const messageUrl = (messageId) => (
        `${apiBase}/api/thread/${encodeURIComponent(currThreadId)}/message/${encodeURIComponent(messageId)}`
    );

    const startEdit = (chat) => {
        setActionError("");
        setEditingId(chat._id);
        setEditValue(chat.content || "");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValue("");
    };

    const saveEdit = async (messageId) => {
        const content = editValue.trim();

        if (!content) {
            setActionError("Message cannot be empty.");
            return;
        }

        setBusyId(messageId);
        setActionError("");

        try {
            const data = await sendRequest(messageUrl(messageId), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content })
            });

            setPrevChats(data.messages || prevChats);
            cancelEdit();
        } catch (err) {
            setActionError(err.message || "Could not update message.");
        } finally {
            setBusyId(null);
        }
    };

    const retryMessage = async (messageId) => {
        setBusyId(messageId);
        setActionError("");

        try {
            const data = await sendRequest(`${messageUrl(messageId)}/retry`, { method: "POST" });
            setPrevChats(data.messages || prevChats);
        } catch (err) {
            setActionError(err.message || "Could not regenerate the response.");
        } finally {
            setBusyId(null);
        }
    };

    const deleteMessage = async (messageId) => {
        if (!window.confirm("Delete this message?")) return;

        setBusyId(messageId);
        setActionError("");

        try {
            const data = await sendRequest(messageUrl(messageId), { method: "DELETE" });
            setPrevChats(data.messages || prevChats);
        } catch (err) {
            setActionError(err.message || "Could not delete message.");
        } finally {
            setBusyId(null);
        }
    };

    const copyMessage = async (chat) => {
        const text = chat.content || "";
        if (!text) return;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }

            setActionError("");
            setCopiedId(chat._id);

            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopiedId(null), 1600);
        } catch {
            setActionError("Could not copy message.");
        }
    };

    return (
        <>
            {newChat && <h1>Start a New Chat!</h1>}
            <div className="chats" ref={chatsContainerRef}>
                {
                    prevChats?.map((chat, idx) => {
                        const isUser = chat.role === "user";
                        const isEditing = editingId === chat._id;
                        const messageKey = chat._id || chat.localId || `message-${idx}`;
                        const isBusy = busyId === chat._id;

                        return (
                            <div className={`messageRow ${isUser ? "userRow" : "assistantRow"}`} key={messageKey}>
                                <div className={`messageBubble ${isUser ? "userBubble" : "assistantBubble"}`}>
                                    {chat.imageUrl && (
                                        <div className="messageImageWrapper">
                                            {isImageUrl(chat.imageUrl) ? (
                                                <img className="messageImage" src={chat.imageUrl} alt="Uploaded" />
                                            ) : (
                                                <a
                                                    className="messageFileLink"
                                                    href={chat.imageUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    <FileIcon />
                                                    View attachment
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    {isEditing ? (
                                        <div className="messageEdit">
                                            <textarea
                                                className="messageEditInput"
                                                value={editValue}
                                                rows={3}
                                                autoFocus
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" && !e.shiftKey) {
                                                        e.preventDefault();
                                                        saveEdit(chat._id);
                                                    }
                                                    if (e.key === "Escape") cancelEdit();
                                                }}
                                            />
                                            <div className="messageEditActions">
                                                <button
                                                    type="button"
                                                    className="messageActionButton save"
                                                    onClick={() => saveEdit(chat._id)}
                                                    disabled={isBusy}
                                                    data-tooltip="Save"
                                                    aria-label="Save message"
                                                    title="Save"
                                                >
                                                    <CheckIcon />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="messageActionButton"
                                                    onClick={cancelEdit}
                                                    data-tooltip="Cancel"
                                                    aria-label="Cancel edit"
                                                    title="Cancel"
                                                >
                                                    <CloseIcon />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {chat.content && (
                                                <p className="messageText">
                                                    {chat.content}
                                                    {chat.editedAt && <span className="messageEdited"> (edited)</span>}
                                                </p>
                                            )}
                                            {chat._id && (
                                                <div className="messageActions">
                                                    <button
                                                        type="button"
                                                        className="messageActionButton"
                                                        onClick={() => startEdit(chat)}
                                                        disabled={isBusy}
                                                        data-tooltip="Edit"
                                                        aria-label="Edit message"
                                                        title="Edit"
                                                    >
                                                        <EditIcon />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="messageActionButton"
                                                        onClick={() => retryMessage(chat._id)}
                                                        disabled={isBusy}
                                                        data-tooltip={isUser ? "Resend" : "Retry"}
                                                        aria-label={isUser ? "Resend message" : "Regenerate response"}
                                                        title={isUser ? "Resend" : "Retry"}
                                                    >
                                                        <RetryIcon />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="messageActionButton danger"
                                                        onClick={() => deleteMessage(chat._id)}
                                                        disabled={isBusy}
                                                        data-tooltip="Delete"
                                                        aria-label="Delete message"
                                                        title="Delete"
                                                    >
                                                        <TrashIcon />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="messageActionButton"
                                                        onClick={() => copyMessage(chat)}
                                                        data-tooltip="Copy"
                                                        aria-label="Copy message"
                                                        title="Copy"
                                                    >
                                                        <CopyIcon />
                                                    </button>
                                                    {copiedId === chat._id && (
                                                        <span className="copiedBadge">Copied</span>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })
                }
                {busyId && (
                    <p className="messageStatus">
                        {prevChats.find(chat => chat._id === busyId)?.role === "user"
                            ? "PtmGPT is regenerating the reply…"
                            : "Updating message…"}
                    </p>
                )}
                {actionError && <p className="messageActionError">{actionError}</p>}
            </div>
        </>
    )
}

export default Chat;
