import "./App.css";
import Sidebar from "./Sidebar.jsx";
import ChatWindow from "./ChatWindow.jsx";
import { MyContext } from "./MyContext.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createThreadId } from "./threadId.js";

const THEME_STORAGE_KEY = "ptmgpt-theme";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const getSystemTheme = () => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const getInitialTheme = () => {
  if (typeof window === "undefined") return "system";
  return localStorage.getItem(THEME_STORAGE_KEY) || "system";
};

const initialAuthForm = {
  email: "",
  mobile: "",
  password: ""
};

function App() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState(null);
  const [currThreadId, setCurrThreadId] = useState(createThreadId());
  const [prevChats, setPrevChats] = useState([]);
  const [newChat, setNewChat] = useState(true);
  const [allThreads, setAllThreads] = useState([]);
  const [themePreference, setThemePreference] = useState(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState(() => (
    getInitialTheme() === "system" ? getSystemTheme() : getInitialTheme()
  ));
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(initialAuthForm);
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

    const applyTheme = () => {
      const nextTheme = themePreference === "system" ? getSystemTheme() : themePreference;
      setResolvedTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    };

    applyTheme();
    localStorage.setItem(THEME_STORAGE_KEY, themePreference);

    if (themePreference === "system") {
      mediaQuery.addEventListener("change", applyTheme);
    }

    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [themePreference]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: "include"
        });

        if (!response.ok) {
          throw new Error("No active session");
        }

        const data = await response.json();
        setAuthUser(data.user);
      } catch {
        setAuthUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkSession();
  }, []);

  const resetChatState = useCallback(() => {
    setPrompt("");
    setReply(null);
    setCurrThreadId(createThreadId());
    setPrevChats([]);
    setNewChat(true);
    setAllThreads([]);
  }, []);

  const handleAuthChange = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");

    const endpoint = authMode === "login" ? "login" : "signup";
    const payload = authMode === "login"
      ? { email: authForm.email, password: authForm.password }
      : authForm;

    try {
      const response = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      setAuthUser(data.user);
      setShowAuthModal(false);
      setAuthForm(initialAuthForm);
      resetChatState();
    } catch (error) {
      setAuthError(error.message || "Authentication failed");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch {
      // Session may already be expired; local state reset still matters.
    } finally {
      setAuthUser(null);
      setShowAuthModal(true);
      setAuthForm(initialAuthForm);
      setAuthError("");
      resetChatState();
    }
  }, [resetChatState]);

  const handleSessionExpired = useCallback(() => {
    setAuthUser(null);
    setAuthError("Your session expired. Please log in again.");
    setShowAuthModal(true);
    resetChatState();
  }, [resetChatState]);

  const openAuthModal = (mode = "login", message = "") => {
    setAuthMode(mode);
    setAuthError(message);
    setShowAuthModal(true);
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setAuthError("");
  };

  const providerValues = useMemo(() => ({
    prompt, setPrompt,
    reply, setReply,
    currThreadId, setCurrThreadId,
    newChat, setNewChat,
    prevChats, setPrevChats,
    allThreads, setAllThreads,
    themePreference, setThemePreference,
    resolvedTheme,
    authUser,
    setAuthUser,
    authLoading,
    apiBase: API_BASE,
    openAuthModal,
    handleLogout,
    handleSessionExpired
  }), [
    allThreads, authLoading, authUser, currThreadId, handleLogout, handleSessionExpired,
    newChat, prevChats, prompt, reply, resolvedTheme, themePreference
  ]);

  const authModal = (
    <div className="authOverlay" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <form className="authCard" onSubmit={handleAuthSubmit}>
        <button type="button" className="authClose" onClick={closeAuthModal} aria-label="Close login modal">
          <i className="fa-solid fa-xmark"></i>
        </button>
        <div className="authBadge">PtmGPT</div>
        <h1 id="authTitle">{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="authCopy">
          Login once, stay signed in for 3 days of inactivity, and the session will end automatically when it expires.
        </p>

        <label>
          Email
          <input
            type="email"
            required
            value={authForm.email}
            onChange={(event) => handleAuthChange("email", event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {authMode === "signup" && (
          <label>
            Mobile
            <input
              type="tel"
              required
              value={authForm.mobile}
              onChange={(event) => handleAuthChange("mobile", event.target.value)}
              placeholder="9876543210"
            />
          </label>
        )}

        <label>
          Password
          <input
            type="password"
            required
            minLength="6"
            value={authForm.password}
            onChange={(event) => handleAuthChange("password", event.target.value)}
            placeholder="Password"
          />
        </label>

        {authError && <p className="authError">{authError}</p>}

        <button className="authSubmit" type="submit" disabled={authSubmitting}>
          {authSubmitting ? "Please wait..." : authMode === "login" ? "Login" : "Sign up"}
        </button>

        <button
          type="button"
          className="authSwitch"
          onClick={() => {
            setAuthError("");
            setAuthMode((prev) => (prev === "login" ? "signup" : "login"));
          }}
        >
          {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
        </button>
      </form>
    </div>
  );
  const useFullPageAuthGate = false;

  if (authLoading) {
    return (
      <div className="app authShell" data-theme={resolvedTheme}>
        <div className="authCard loadingCard">
          <p>Checking your session...</p>
        </div>
      </div>
    );
  }

  if (useFullPageAuthGate && !authUser) {
    return (
      <div className="app authShell" data-theme={resolvedTheme}>
        <form className="authCard" onSubmit={handleAuthSubmit}>
          <div className="authBadge">PtmGPT</div>
          <h1>{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="authCopy">
            Login once, stay signed in for 3 days of inactivity, and the session will end automatically when it expires.
          </p>

          <label>
            Email
            <input
              type="email"
              required
              value={authForm.email}
              onChange={(event) => handleAuthChange("email", event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          {authMode === "signup" && (
            <label>
              Mobile
              <input
                type="tel"
                required
                value={authForm.mobile}
                onChange={(event) => handleAuthChange("mobile", event.target.value)}
                placeholder="9876543210"
              />
            </label>
          )}

          <label>
            Password
            <input
              type="password"
              required
              minLength="6"
              value={authForm.password}
              onChange={(event) => handleAuthChange("password", event.target.value)}
              placeholder="••••••••"
            />
          </label>

          {authError && <p className="authError">{authError}</p>}

          <button className="authSubmit" type="submit" disabled={authSubmitting}>
            {authSubmitting ? "Please wait..." : authMode === "login" ? "Login" : "Sign up"}
          </button>

          <button
            type="button"
            className="authSwitch"
            onClick={() => {
              setAuthError("");
              setAuthMode((prev) => (prev === "login" ? "signup" : "login"));
            }}
          >
            {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app" data-theme={resolvedTheme}>
      <MyContext.Provider value={providerValues}>
        <Sidebar
          isOpen={isSidebarOpen}
          onNavigate={() => setIsSidebarOpen(false)}
        />
        {isSidebarOpen && (
          <button
            type="button"
            className="sidebarBackdrop"
            aria-label="Close sidebar"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        <ChatWindow onToggleSidebar={() => setIsSidebarOpen(prev => !prev)} />
        {!authUser && showAuthModal && authModal}
      </MyContext.Provider>
    </div>
  );
}

export default App;
