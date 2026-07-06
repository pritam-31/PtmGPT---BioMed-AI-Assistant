import React, { useContext, useState } from "react";
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
            actionLabel: "Upgrade now"
        },
        {
            id: "premium",
            title: "Premium",
            price: "₹499 / month",
            bullets: ["Unlimited access", "Faster models", "Premium support"],
            upiAmount: "499.00",
            actionLabel: "Upgrade now"
        }
    ];

    const UPI_ID = "6372516197-2@ibl";
    const merchantName = "PtmGPT";

    const getUpiUrl = (plan) => {
        if (!plan.upiAmount) return null;
        const upiDeepLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(merchantName)}&tn=${encodeURIComponent(plan.title)}&am=${encodeURIComponent(plan.upiAmount)}&cu=INR`;
        return upiDeepLink;
    };

    const getQrUrl = (plan) => {
        const upiLink = getUpiUrl(plan);
        if (!upiLink) return null;
        return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(upiLink)}&size=180x180`;
    };

    const handleUpgrade = async (plan) => {
        if (plan.id === "starter") {
            setStatusMessage("Aap free plan par ho. 28 free chats ka upyog karein.");
            return;
        }

        setLoading(true);
        setStatusMessage("Upgrade plan ko activate kiya ja raha hai...");
        try {
            const response = await fetch(`${apiBase}/api/auth/upgrade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ plan: plan.id })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Upgrade failed");
            }
            setAuthUser(data.user);
            setStatusMessage(`Aapka ${plan.title} ab active ho chuka hai.`);
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
                <p className="upgradeSub">Free users get 28 chats for medical text and images. After that, upgrade to continue.</p>
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
                                <div className="qrSection">
                                    <div className="qrBackdrop">
                                        <img src={getQrUrl(plan)} alt={`${plan.title} UPI QR`} />
                                    </div>
                                    <p className="qrText">Scan to pay via UPI</p>
                                    <p className="upiId">{UPI_ID}</p>
                                </div>
                            ) : (
                                <div className="freeCardTag">Starter plan included — 28 free chats</div>
                            )}
                        </div>
                    ))}
                </div>
                {statusMessage && <div className="upgradeStatus">{statusMessage}</div>}
                <p className="upgradeHint">Payment method: Scan QR or pay directly to UPI ID to complete payment and unlock plan access.</p>
            </div>
        </div>
    );
}

export default UpgradeModal;
