const safeUser = (user) => ({
    id: user._id.toString(),
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    plan: user.plan || "free",
    freeChatsRemaining: typeof user.freeChatsRemaining === "number" ? user.freeChatsRemaining : 28,
    upgradedAt: user.upgradedAt || null
});

export const requireAuth = (req, res, next) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: "Authentication required" });
    }

    req.user = req.session.user;
    next();
};

export const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session?.user) {
            return res.status(401).json({ error: "Authentication required" });
        }

        if (!roles.includes(req.session.user.role)) {
            return res.status(403).json({ error: "Not authorized" });
        }

        req.user = req.session.user;
        next();
    };
};

export const setSessionUser = (req, user) => {
    req.session.user = safeUser(user);
    return req.session.user;
};

export const getSafeUser = safeUser;
