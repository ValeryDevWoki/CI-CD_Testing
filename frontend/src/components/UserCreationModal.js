// src/components/UserCreationModal.js
import React, { useState } from 'react';
import { createUser } from '../services/api'; // קריאה ליצירת משתמש
import './UserCreationModal.css'; // סגנון זהה ל-ShiftModificationModal.css

export default function UserCreationModal({ onClose, onUserCreated }) {
    // מצבים מקומיים עבור השדות
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState('Employee');
    const [status, setStatus] = useState('Active');
    const [maxDays, setMaxDays] = useState(5);
    const [errorMessage, setErrorMessage] = useState('');
    const phoneInvalid = phone.length > 0 && phone.length < 10;

    const handleSave = async () => {
        setErrorMessage('');
        try {
            // בניית אובייקט המשתמש
            const userData = {
                full_name: fullName,
                email,
                phone,
                role,
                status,
                groups: [],     // התחלה עם קבוצות ריקות
                max_days: maxDays
            };

            // קריאה ל-API
            const newUser = await createUser(userData);

            // הודעה להורה
            if (onUserCreated) {
                onUserCreated(newUser);
            }
        } catch (err) {
            setErrorMessage(err.message || 'נכשל ביצירת המשתמש.');
        }
    };



    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>יצירת משתמש חדש</h3>

                {errorMessage && (
                    <div className="modal-error-alert">
                        {errorMessage}
                    </div>
                )}

                <div className="form-row">
                    <label>שם מלא:</label>
                    <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                    />
                </div>

                <div className="form-row">
                    <label>דוא"ל:</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div className="form-row">
                    <label>טלפון:</label>


                    <input
                        type="text"
                        value={phone}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        placeholder="05XXXXXXXX"
                        className={phoneInvalid ? 'input-error' : ''}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        onPaste={(e) => {
                            e.preventDefault();
                            const text = e.clipboardData?.getData('text') || '';
                            setPhone(text.replace(/\D/g, '').slice(0, 10));
                        }}
                    />

                </div>

                <div className="form-row">
                    <label>תפקיד:</label>
                    <select value={role} onChange={(e) => setRole(e.target.value)}>
                        <option value="Employee">עובד</option>
                        <option value="Manager">מנהל</option>
                        <option value="Admin">מנהל מערכת</option>
                    </select>
                </div>

                <div className="form-row">
                    <label>מס' ימים:</label>
                    <input
                        type="number"
                        value={maxDays}
                        onChange={(e) => setMaxDays(Number(e.target.value))}
                    />
                </div>

                <div className="form-row">
                    <label>סטטוס:</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="Active">פעיל</option>
                        <option value="Not Active">לא פעיל</option>
                        <option value="Terminated">מפוטר</option>
                    </select>
                </div>

                <div className="modal-buttons">
                    <button className="save-button" onClick={handleSave}>
                        שמור
                    </button>
                    <button className="cancel-button" onClick={onClose}>
                        ביטול
                    </button>
                </div>
            </div>
        </div>
    );
}
