import "./Sidebar.css";
import { useCallback, useContext, useEffect } from "react";
import { MyContext } from "./MyContext.jsx";
import { createThreadId } from "./threadId.js";
import ptmLogo from "./assets/PtmGPT.png";

function Sidebar({ isOpen = false, onNavigate }) {
    const {allThreads, setAllThreads, currThreadId, setNewChat, setPrompt, setReply, setCurrThreadId, setPrevChats, apiBase, authUser, handleSessionExpired} = useContext(MyContext);

    const getAllThreads = useCallback(async () => {
        if (!authUser) {
            setAllThreads([]);
            return;
        }

        try {
            const response = await fetch(`${apiBase}/api/thread`, {
                credentials: "include"
            });

            if (response.status === 401) {
                handleSessionExpired?.();
                return;
            }

            const res = await response.json();
            const filteredData = res.map(thread => ({threadId: thread.threadId, title: thread.title}));
            setAllThreads(filteredData);
        } catch(err) {
            console.log(err);
        }
    }, [apiBase, authUser, handleSessionExpired, setAllThreads]);

    useEffect(() => {
        getAllThreads();
    }, [currThreadId, getAllThreads])


    const createNewChat = () => {
        setNewChat(true);
        setPrompt("");
        setReply(null);
        setCurrThreadId(createThreadId());
        setPrevChats([]);
        onNavigate?.();
    }

    const changeThread = async (newThreadId) => {
        if (!authUser) return;

        setCurrThreadId(newThreadId);

        try {
            const response = await fetch(`${apiBase}/api/thread/${newThreadId}`, {
                credentials: "include"
            });

            if (response.status === 401) {
                handleSessionExpired?.();
                return;
            }

            const res = await response.json();
            setPrevChats(res);
            setNewChat(false);
            setReply(null);
            onNavigate?.();
        } catch(err) {
            console.log(err);
        }
    }   

    const deleteThread = async (threadId) => {
        if (!authUser) return;

        try {
            const response = await fetch(`${apiBase}/api/thread/${threadId}`, {
                method: "DELETE",
                credentials: "include"
            });

            if (response.status === 401) {
                handleSessionExpired?.();
                return;
            }

            await response.json();

            setAllThreads(prev => prev.filter(thread => thread.threadId !== threadId));

            if(threadId === currThreadId) {
                createNewChat();
            }

        } catch(err) {
            console.log(err);
        }
    }

    return (
        <section className={`sidebar ${isOpen ? "sidebarOpen" : ""}`}>
            <button onClick={createNewChat} className="brandBtn">
                <img src={ptmLogo} alt="PtmGPT" className="logo" />
                <span><i className="fa-solid fa-pen-to-square"></i></span>
            </button>


            <ul className="history">
                {
                    allThreads?.map((thread, idx) => (
                        <li key={idx} 
                            onClick={() => changeThread(thread.threadId)}
                            className={thread.threadId === currThreadId ? "highlighted": " "}
                        >
                            {thread.title}
                            <i className="fa-solid fa-trash"
                                onClick={(e) => {
                                    e.stopPropagation(); //stop event bubbling
                                    deleteThread(thread.threadId);
                                }}
                            ></i>
                        </li>
                    ))
                }
            </ul>
 
            <div className="sign">
                <p>By Ptm &hearts;</p>
            </div>
        </section>
    )
}

export default Sidebar;
