import "./Chat.css";
import { useContext, useRef, useEffect } from "react";
import { MyContext } from "./MyContext";

const isImageUrl = (url) => (
    typeof url === "string"
    && (url.startsWith("blob:") || /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(url))
);

function Chat() {
    const {newChat, prevChats} = useContext(MyContext);
    const chatsContainerRef = useRef(null);

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

    return (
        <>
            {newChat && <h1>Start a New Chat!</h1>}
            <div className="chats" ref={chatsContainerRef}>
                {
                    prevChats?.map((chat, idx) => (
                        <div className={`messageRow ${chat.role === "user" ? "userRow" : "assistantRow"}`} key={idx}>
                            <div className={`messageBubble ${chat.role === "user" ? "userBubble" : "assistantBubble"}`}>
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
                                                <i className="fa-solid fa-file-medical"></i>
                                                View attachment
                                            </a>
                                        )}
                                    </div>
                                )}
                                {chat.content && <p className="messageText">{chat.content}</p>}
                            </div>
                        </div>
                    ))
                }
            </div>
        </>
    )
}

export default Chat;
