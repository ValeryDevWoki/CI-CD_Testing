import React, { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import {
    fetchBlockers,
    createBlocker,
    updateBlocker,
    deleteBlocker
} from '../services/api';
import './BlockerManagementPage.css';

const BlockerManagementPage = () => {
    const [blockers, setBlockers] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showModal, setShowModal] = useState(false);

    // שדות הטופס
    const [type, setType] = useState('weekly'); // 'weekly' or 'date'
    const [dayName, setDayName] = useState('ראשון');
    const [dateVal, setDateVal] = useState('');
    const [endDateVal, setEndDateVal] = useState(''); // עבור חסימה חד-פעמית – תאריך סיום
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [reason, setReason] = useState('');

    useEffect(() => {
        loadBlockers();
    }, []);

    async function loadBlockers() {
        try {
            const data = await fetchBlockers();
            setBlockers(data);
        } catch (err) {
            console.error("שגיאה בטעינת החסימות:", err);
            alert(err.message || "שגיאה בטעינת החסימות");
        }
    }

    function resetForm() {
        setEditingId(null);
        setType('weekly');
        setDayName('ראשון');
        setDateVal('');
        setEndDateVal('');
        setStartTime('09:00');
        setEndTime('17:00');
        setReason('');
    }

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            const blockerData = {
                type,
                day_name: dayName,
                date: dateVal || null,
                end_date: endDateVal || null,
                start_time: startTime,
                end_time: endTime,
                reason
            };

            if(editingId) {
                await updateBlocker(editingId, blockerData);
                alert("חסימה עודכנה!");
            } else {
                await createBlocker(blockerData);
                alert("חסימה נוצרה!");
            }
            resetForm();
            loadBlockers();
            setShowModal(false);
        } catch(err) {
            console.error("שגיאה בשמירת החסימה:", err);
            alert(err.message || "שגיאה בשמירת החסימה");
        }
    }

    function handleEdit(b) {
        setEditingId(b.id);
        setType(b.type);
        setDayName(b.day_name || 'ראשון');
        setDateVal(b.date ? b.date.split('T')[0] : '');
        setEndDateVal(b.end_date ? b.end_date.split('T')[0] : '');
        setStartTime(b.start_time);
        setEndTime(b.end_time);
        setReason(b.reason || '');
        setShowModal(true);
    }

    async function handleDelete(id) {
        if(!window.confirm("האם אתה בטוח שברצונך למחוק את החסימה הזו?")) return;
        try {
            await deleteBlocker(id);
            alert("חסימה נמחקה.");
            loadBlockers();
        } catch(err) {
            console.error("שגיאה במחיקת החסימה:", err);
            alert(err.message || "שגיאה במחיקת החסימה");
        }
    }

    return (
        <div className="blocker-management-page">
            <NavBar />
            <h2>ניהול חסימות שעות עבודה</h2>

            {/* כפתור לפתיחת הטופס */}
            <div className="create-button-container">
                <button
                    className="create-button"
                    onClick={() => { resetForm(); setShowModal(true); }}>
                    צור חסימה חדשה
                </button>
            </div>

            {/* טבלת החסימות */}
            <table className="blocker-table">
                <thead>
                <tr>
                    <th>סוג</th>
                    <th>יום / תאריך</th>
                    <th>תאריך סיום</th>
                    <th>התחלה</th>
                    <th>סיום</th>
                    <th>סיבה</th>
                    <th>פעולות</th>
                </tr>
                </thead>
                <tbody>
                {blockers.map(b => (
                    <tr key={b.id}>
                        <td>{b.type === 'weekly' ? 'שבועי' : 'תאריך'}</td>
                        <td>{b.type === 'weekly' ? b.day_name : b.date ? b.date.split('T')[0] : ''}</td>
                        <td>{b.type === 'date' && b.end_date ? b.end_date.split('T')[0] : ''}</td>
                        <td>{b.start_time}</td>
                        <td>{b.end_time}</td>
                        <td>{b.reason}</td>
                        <td>
                            <button onClick={() => handleEdit(b)}>ערוך</button>
                            <button onClick={() => handleDelete(b.id)}>מחק</button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>

            {/* חלון מודאלי לטופס חסימות */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        <form className="blocker-form" onSubmit={handleSubmit}>
                            <div className="form-row">
                                <label>סוג:</label>
                                <select value={type} onChange={e=> setType(e.target.value)}>
                                    <option value="weekly">שבועי</option>
                                    <option value="date">תאריך</option>
                                </select>
                            </div>

                            {type === 'weekly' && (
                                <div className="form-row">
                                    <label>שם היום:</label>
                                    <select value={dayName} onChange={e=> setDayName(e.target.value)}>
                                        <option>ראשון</option>
                                        <option>שני</option>
                                        <option>שלישי</option>
                                        <option>רביעי</option>
                                        <option>חמישי</option>
                                        <option>שישי</option>
                                        <option>שבת</option>
                                    </select>
                                </div>
                            )}

                            {type === 'date' && (
                                <>
                                    <div className="form-row">
                                        <label>תאריך:</label>
                                        <input type="date" value={dateVal} onChange={e=> setDateVal(e.target.value)} required />
                                    </div>
                                    <div className="form-row">
                                        <label>תאריך סיום:</label>
                                        <input type="date" value={endDateVal} onChange={e=> setEndDateVal(e.target.value)} required />
                                    </div>
                                </>
                            )}

                            <div className="form-row">
                                <label>שעת התחלה:</label>
                                <input type="time" value={startTime} onChange={e=> setStartTime(e.target.value)} required />
                            </div>

                            <div className="form-row">
                                <label>שעת סיום:</label>
                                <input type="time" value={endTime} onChange={e=> setEndTime(e.target.value)} required />
                            </div>

                            <div className="form-row">
                                <label>סיבה:</label>
                                <input type="text" value={reason} onChange={e=> setReason(e.target.value)} />
                            </div>

                            <div className="form-buttons">
                                <button type="submit">{editingId ? "עדכן חסימה" : "צור חסימה"}</button>
                                {editingId && <button type="button" onClick={() => { resetForm(); setShowModal(false); }}>ביטול</button>}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BlockerManagementPage;
