// src/pages/Login.js
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './login.css';

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');
const GOOGLE_CLIENT_ID = '588713129121-jf63q7kq2v2fkokbimksb6lqhd5263vc.apps.googleusercontent.com';

export default function Login({ setUserRole, setIsAuthenticated, setUser }) {
    const errorRef = useRef();
    const navigate = useNavigate();
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Inject GSI script & initialize popup-mode button
    useEffect(() => {
        let intervalId;
        let initted = false;

        function setupGSI() {
            if (initted || !window.google?.accounts?.id) return;
            initted = true;
            setIsGoogleReady(true);

            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleCredResponse,
                ux_mode: 'popup',            // ← force popup
                auto_select: false,
                cancel_on_tap_outside: false,
            });

            const btn = document.getElementById('googleSignInDiv');
            if (btn) {
                btn.innerHTML = '';
                window.google.accounts.id.renderButton(btn, {
                    theme: 'filled_blue',
                    size: 'large',
                    width: btn.offsetWidth || 300,
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left',
                });
            }
        }

        // 1) inject the script if missing
        if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = setupGSI;
            document.head.appendChild(script);
        } else {
            setupGSI();
        }

        // 2) polling fallback
        intervalId = setInterval(setupGSI, 300);
        return () => clearInterval(intervalId);
    }, []);

    async function handleCredResponse(response) {
        if (!response.credential) {
            showError('No credential received from Google.');
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/login/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ credential: response.credential }),
            });

            if (!res.ok) {
                let msg = 'Google login failed';
                try {
                    const p = await res.json();
                    if (p.error) msg = p.error + (p.email ? ` (${p.email})` : '');
                } catch {}
                throw new Error(msg);
            }

            const userData = await res.json();
            setUserRole(userData.role);
            setIsAuthenticated(true);
            setUser(userData);
            try { localStorage.setItem('yardena_user', JSON.stringify(userData)); } catch (_e) {}
            navigate(
                ['Admin', 'Manager'].includes(userData.role)
                    ? '/admin-dashboard'
                    : '/employee-dashboard'
            );
        } catch (err) {
            console.error(err);
            showError(err.message);
        } finally {
            setIsLoading(false);
        }
    }

    function showError(msg) {
        if (!errorRef.current) return;
        errorRef.current.textContent = msg;
        errorRef.current.style.display = 'block';
        setTimeout(() => {
            if (errorRef.current) errorRef.current.style.display = 'none';
        }, 5000);
    }

    return (
        <div className="login-page">
            <div className="background-decoration">
                <div className="floating-orb orb-1" />
                <div className="floating-orb orb-2" />
                <div className="floating-orb orb-3" />
            </div>

            <div className="login-card">
                <div className="glass-overlay" />
                <div className="login-content">
                    <div className="login-header">
                        <div className="login-icon">
                            <svg className="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6
                     a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10
                     V7a4 4 0 00-8 0v4h8z"
                                />
                            </svg>
                        </div>
                        <h1 className="login-title">ברוכים הבאים לירדנה</h1>
                        <p className="login-subtitle">התחבר כדי לגשת ללוח המחוונים שלך</p>
                    </div>

                    <div className="signin-section">
                        <div className="signin-content">
                            <div className="google-button-container">
                                <div id="googleSignInDiv" className="google-signin-button" />
                                {isLoading && (
                                    <div className="loading-overlay">
                                        <div className="spinner small" />
                                    </div>
                                )}
                            </div>
                            <div className="divider-container">
                                <div className="divider-line" />
                            </div>
                        </div>

                        <div ref={errorRef} className="error-message" />
                        <div className="terms-text">
                            <p>על ידי כניסה, הנך מסכים לתנאי השירות ולמדיניות הפרטיות שלנו</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="decorative-line" />
        </div>
    );
}
