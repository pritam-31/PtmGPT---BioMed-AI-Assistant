import { useContext, useState } from "react";
import { MyContext } from "./MyContext.jsx";
import "./UpgradeModal.css";

function UpgradeModal({ onClose }) {
    const { apiBase, setAuthUser } = useContext(MyContext);
    const [statusMessage, setStatusMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const plans = [
        {
            id: "starter",
            title: "Starter (Free)",
            price: "Free",
            bullets: ["28 free chats", "Basic model access", "Community support"],
            upiAmount: null,
            actionLabel: "Using free"
        },
        {
            id: "cloud",
            title: "Cloud Plan",
            price: "₹199 / month",
            bullets: ["Higher rate limits", "Faster responses", "Priority queue"],
            upiAmount: "199.00",
            actionLabel: "I have paid"
        },
        {
            id: "premium",
            title: "Premium",
            price: "₹499 / month",
            bullets: ["Unlimited access", "Faster models", "Premium support"],
            upiAmount: "499.00",
            actionLabel: "I have paid"
        }
    ];

    // Personal payment details are configured via environment variables and are
    // never hard-coded in source. Leave VITE_UPI_ID empty to hide payments.
    const UPI_ID = import.meta.env.VITE_UPI_ID || "";
    const merchantName = import.meta.env.VITE_UPI_MERCHANT_NAME || "PtmGPT";
    const paymentsConfigured = Boolean(UPI_ID);

    const getUpiUrl = (plan) => {
        if (!plan.upiAmount || !paymentsConfigured) return null;
        return `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(merchantName)}&tn=${encodeURIComponent(plan.title)}&am=${encodeURIComponent(plan.upiAmount)}&cu=INR`;
    };

    const getQrUrl = (plan) => {
        const upiLink = getUpiUrl(plan);
        if (!upiLink) return null;
        return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(upiLink)}&size=180x180`;
    };

    const handleUpgrade = async (plan) => {
        if (plan.id === "starter") {
            setStatusMessage("You are on the free plan. You have 28 free chats.");
            return;
        }

        setLoading(true);
        setStatusMessage("Checking plan status...");

        try {
            const response = await fetch(`${apiBase}/api/auth/upgrade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ plan: plan.id })
            });
            const data = await response.json();

            if (response.status === 403) {
                setStatusMessage(
                    "Payments are not automated yet. After paying via UPI, an administrator must activate your plan. Please contact the project owner with your payment reference."
                );
                return;
            }

            if (!response.ok) {
                throw new Error(data.error || "Upgrade failed");
            }

            if (data.user) {
                setAuthUser(data.user);
            }
            setStatusMessage(`Your ${plan.title} plan is now active.`);
            setTimeout(() => {
                onClose();
            }, 1200);
        } catch (err) {
            setStatusMessage(err.message || "Upgrade failed. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="upgradeOverlay" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="upgradeCardWrapper" onClick={(e) => e.stopPropagation()}>
                <button className="upgradeClose" onClick={onClose} aria-label="Close">×</button>
                <h2>Choose a plan to upgrade</h2>
                <p className="upgradeSub">Free users get 28 chats for medical text and images. Plans are activated manually by an administrator; there is no automated payment processing.</p>
                <div className="upgradeCards">
                    {plans.map(plan => (
                        <div className={`upgradeCard ${plan.id === "starter" ? "starterPlan" : "paidPlan"}`} key={plan.id}>
                            <div className="planHeader">
                                <h3>{plan.title}</h3>
                                <div className="price">{plan.price}</div>
                            </div>
                            <ul>
                                {plan.bullets.map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                            {plan.upiAmount ? (
                                paymentsConfigured ? (
                                    <div className="qrSection">
                                        <div className="qrBackdrop">
                                            <img src={getQrUrl(plan)} alt={`${plan.title} UPI QR`} />
                                        </div>
                                        <p className="qrText">Scan to pay via UPI</p>
                                        <p className="upiId">{UPI_ID}</p>
                                        <button
                                            type="button"
                                            className="authSubmit"
                                            onClick={() => handleUpgrade(plan)}
                                            disabled={loading}
                                        >
                                            {loading ? "Please wait..." : plan.actionLabel}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="freeCardTag">Payments are not configured for this deployment.</div>
                                )
                            ) : (
                                <div className="freeCardTag">Starter plan included — 28 free chats</div>
                            )}
                        </div>
                    ))}
                </div>
                {statusMessage && <div className="upgradeStatus">{statusMessage}</div>}
                <p className="upgradeHint">Plan activation is manual. Paying does not unlock the plan automatically.</p>
            </div>
        </div>
    );
}

export default UpgradeModal;
