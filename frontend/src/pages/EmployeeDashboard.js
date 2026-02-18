import React, { useEffect, useRef, useState } from 'react';
import {
    fetchShiftsByWeek,
    createShift,
    updateShift,
    deleteShift,
    markShiftsSent,
    fetchNotes,
    createNote,
    updateNote as updateNoteAPI,
} from '../services/api';
import {
    getCurrentWeekCode,
    nextWeek,
    getDateForWeekDay,
    formatDDMM
} from '../utils/dateUtils';
import './EmployeeDashboard.css';

const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const EMP_DELETED_MSG = 'הערה נמחקה ע"י הנציג';

function autoFormatTime(value) {
    const digits = value.replace(/\D/g, '');
    if (!digits) return "";
    if (digits.length <= 2) return digits;
    const hh = digits.substring(0, 2);
    const mm = digits.substring(2, 4);
    return mm ? `${hh}:${mm}` : hh;
}

function getFriendlyErrorMessage(err, fallback) {
    const message = (err && err.message) ? err.message : fallback;
    return `שגיאה: ${message}`;
}

export default function EmployeeDashboard({ user }) {
    const employeeId = user?.id;
    const employeeName = user?.name || `עובד #${employeeId}`;

    const currentWeek = getCurrentWeekCode();

    const [registrationOffset, setRegistrationOffset] = useState(1);
    const registrationWeekCode = nextWeek(currentWeek, registrationOffset);

    const [currentWeekData, setCurrentWeekData] = useState({ weekCode: currentWeek, locked: false, shifts: [] });
    const [registrationWeekData, setRegistrationWeekData] = useState({ weekCode: registrationWeekCode, locked: false, shifts: [] });

    const [publishedOffset, setPublishedOffset] = useState(0);
    const publishedWeekCode = nextWeek(currentWeek, publishedOffset);
    const [publishedWeekData, setPublishedWeekData] = useState({ weekCode: publishedWeekCode, locked: false, shifts: [] });

    const [errorMessage, setErrorMessage] = useState("");

    const registrationWeekDataRef = useRef(registrationWeekData);
    const dayRefs = useRef({});
    const debounceTimers = useRef({});

    useEffect(() => {
        registrationWeekDataRef.current = registrationWeekData;
    }, [registrationWeekData]);

    useEffect(() => {
        async function loadCurrent() {
            try {
                const data = await fetchShiftsByWeek(currentWeek);
                setCurrentWeekData({ weekCode: currentWeek, ...data });
            } catch (err) {
                setErrorMessage(getFriendlyErrorMessage(err, `נכשל בטעינת משמרות לשבוע ${currentWeek}`));
            }
        }
        loadCurrent();
    }, [currentWeek]);

    // Load registration week shifts + notes (notes survive refresh/login)
    useEffect(() => {
        async function loadRegistrationWeek() {
            try {
                const data = await fetchShiftsByWeek(registrationWeekCode);

                const allNotes = await fetchNotes();
                const myNotes = (allNotes || []).filter(n => n.employee_id === employeeId);

                const noteByDate = new Map(myNotes.map(n => [n.date, n]));

                const baseShifts = Array.isArray(data?.shifts) ? data.shifts : [];
                const shifts = baseShifts.map(s => ({ ...s }));

                for (const dayName of days) {
                    const dayIndex = days.indexOf(dayName);

                    const dateObj = getDateForWeekDay(registrationWeekCode, dayIndex);
                    const localDate = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
                    const date = localDate.toISOString().split('T')[0];

                    const noteRow = noteByDate.get(date);

                    const existingShift = shifts.find(
                        s => s.employee_id === employeeId && s.day_name === dayName
                    );

                    if (noteRow) {
                        // IMPORTANT: if note is the "deleted by employee" message, worker should see empty
                        const effectiveNote = (noteRow.note === EMP_DELETED_MSG) ? '' : (noteRow.note || '');

                        if (existingShift) {
                            if ((!existingShift.note || existingShift.note.trim() === "") && effectiveNote) {
                                existingShift.note = effectiveNote;
                            }
                        } else {
                            // only create virtual shift if we have real text to show
                            if (effectiveNote) {
                                shifts.push({
                                    id: null,
                                    week_code: registrationWeekCode,
                                    day_name: dayName,
                                    employee_id: employeeId,
                                    start_time: '',
                                    end_time: '',
                                    note: effectiveNote,
                                    issent: false,
                                    ispublished: false,
                                    _noteId: noteRow.id
                                });
                            }
                        }
                    }
                }

                setRegistrationWeekData({
                    weekCode: registrationWeekCode,
                    locked: !!data?.locked,
                    shifts
                });
            } catch (err) {
                setErrorMessage(getFriendlyErrorMessage(err, `נכשל בטעינת משמרות לשבוע ${registrationWeekCode}`));
            }
        }
        loadRegistrationWeek();
    }, [registrationWeekCode, employeeId]);

    useEffect(() => {
        async function loadPublishedWeek() {
            try {
                const data = await fetchShiftsByWeek(publishedWeekCode);
                setPublishedWeekData({ weekCode: publishedWeekCode, ...data });
            } catch (err) {
                setErrorMessage(getFriendlyErrorMessage(err, `נכשל בטעינת משמרות לשבוע ${publishedWeekCode}`));
            }
        }
        loadPublishedWeek();
    }, [publishedWeekCode]);

    const handlePrevWeek = () => {
        if (registrationOffset > 1) {
            setRegistrationOffset(prev => prev - 1);
            setErrorMessage("");
        }
    };
    const handleNextWeek = () => {
        setRegistrationOffset(prev => prev + 1);
        setErrorMessage("");
    };

    const handlePrevPublishedWeek = () => {
        setPublishedOffset(prev => prev - 1);
        setErrorMessage("");
    };
    const handleNextPublishedWeek = () => {
        setPublishedOffset(prev => prev + 1);
        setErrorMessage("");
    };

    const getShiftStatus = (shift, isLocked) => {
        if (isLocked) return "נעול";
        if (!shift) return "פתוח";
        if (shift.issent) return "נשלח";
        return "פתוח";
    };

    const handleSaveInline = async (dayName) => {
        const shift = registrationWeekDataRef.current.shifts.find(
            s => s.employee_id === employeeId && s.day_name === dayName
        );
        if (!shift) return;
        if (!shift.start_time || !shift.end_time) return;

        try {
            if (shift.id) {
                const updated = await updateShift({
                    id: shift.id,
                    day_name: shift.day_name,
                    start_time: shift.start_time,
                    end_time: shift.end_time,
                    note: shift.note || ''
                });
                setRegistrationWeekData(prev => {
                    const newShifts = prev.shifts.map(s => (s.id === shift.id ? { ...s, ...updated } : s));
                    return { ...prev, shifts: newShifts };
                });
            } else {
                const created = await createShift({
                    week_code: registrationWeekDataRef.current.weekCode,
                    day_name: shift.day_name,
                    employee_id: employeeId,
                    start_time: shift.start_time,
                    end_time: shift.end_time,
                    note: shift.note || ''
                });
                setRegistrationWeekData(prev => {
                    const newShifts = prev.shifts.map(s => ({ ...s }));
                    const idx = newShifts.findIndex(s => s.employee_id === employeeId && s.day_name === dayName && !s.id);
                    if (idx >= 0) newShifts[idx] = { ...created };
                    else newShifts.push({ ...created });
                    return { ...prev, shifts: newShifts };
                });
            }
        } catch (err) {
            console.error("Error saving shift:", err);
            setErrorMessage(getFriendlyErrorMessage(err, "נכשל בשמירת המשמרת"));
        }
    };

    // ✅ IMPORTANT: saveEmployeeNote must run even when text becomes empty
    const saveEmployeeNote = async (dayName, noteText) => {
        const dayIndex = days.indexOf(dayName);
        const dateObj = getDateForWeekDay(registrationWeekData.weekCode, dayIndex);
        const localDate = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
        const date = localDate.toISOString().split('T')[0];

        try {
            const allNotes = await fetchNotes();
            const existingNote = allNotes.find(n => n.employee_id === employeeId && n.date === date);

            // ✅ If text cleared -> send empty string to backend (backend will store "הערה נמחקה..." + clear shifts.note)
            if (!noteText || noteText.trim() === "") {
                if (existingNote) {
                    await updateNoteAPI({ id: existingNote.id, note: "" });
                }
                return;
            }

            if (existingNote) {
                if (existingNote.note !== noteText) {
                    await updateNoteAPI({ id: existingNote.id, note: noteText });
                }
            } else {
                await createNote({
                    employee_id: employeeId,
                    date,
                    note: noteText,
                    status: "new",
                    decision: "pending"
                });
            }
        } catch (err) {
            console.error("שגיאה בשמירת ההערה:", err);
        }
    };

    const handleKeyDown = (e, dayName, field) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (field === 'start_time' && dayRefs.current[dayName]?.end) {
                dayRefs.current[dayName].end.focus();
            } else if (field === 'end_time' && dayRefs.current[dayName]?.note) {
                dayRefs.current[dayName].note.focus();
            }
        }
    };

    const handleInlineChange = (dayName, field, rawValue) => {
        let value = rawValue;
        if (field === 'start_time' || field === 'end_time') {
            value = autoFormatTime(rawValue);
        }

        setRegistrationWeekData(prev => {
            const newShifts = prev.shifts.map(s => ({ ...s }));
            let shift = newShifts.find(s => s.employee_id === employeeId && s.day_name === dayName);
            if (!shift) {
                shift = {
                    id: null,
                    week_code: prev.weekCode,
                    day_name: dayName,
                    employee_id: employeeId,
                    start_time: '',
                    end_time: '',
                    note: ''
                };
                newShifts.push(shift);
            }
            shift[field] = value;
            return { ...prev, shifts: newShifts };
        });

        if (field === 'start_time' || field === 'end_time') {
            if (debounceTimers.current[dayName]) clearTimeout(debounceTimers.current[dayName]);
            debounceTimers.current[dayName] = setTimeout(() => {
                const shift = registrationWeekDataRef.current.shifts.find(
                    s => s.employee_id === employeeId && s.day_name === dayName
                );
                if (shift && shift.start_time && shift.end_time) {
                    handleSaveInline(dayName);
                }
            }, 500);
        }

        // ✅ NOTE debounce: always call saveEmployeeNote even if note is empty
        if (field === 'note') {
            if (debounceTimers.current[dayName + '_note']) clearTimeout(debounceTimers.current[dayName + '_note']);
            debounceTimers.current[dayName + '_note'] = setTimeout(() => {
                const shift = registrationWeekDataRef.current.shifts.find(
                    s => s.employee_id === employeeId && s.day_name === dayName
                );
                if (!shift) return;

                // always sync to notes (empty included)
                saveEmployeeNote(dayName, shift.note || "");

                // if times exist, also save shift
                if (shift.start_time && shift.end_time) {
                    handleSaveInline(dayName);
                }
            }, 600);
        }
    };

    // force-save everything before sending
    async function ensureSavedBeforeSend() {
        Object.values(debounceTimers.current).forEach(t => t && clearTimeout(t));

        for (const dayName of days) {
            const shift = registrationWeekDataRef.current.shifts.find(
                s => s.employee_id === employeeId && s.day_name === dayName
            );
            if (shift) {
                await saveEmployeeNote(dayName, shift.note || "");
            }
        }

        for (const dayName of days) {
            const shift = registrationWeekDataRef.current.shifts.find(
                s => s.employee_id === employeeId && s.day_name === dayName
            );
            if (shift?.start_time && shift?.end_time) {
                await handleSaveInline(dayName);
            }
        }
    }

    const handleSendToManagerInline = async () => {
        if (registrationWeekData.locked) {
            setErrorMessage("השבוע נעול. אינך יכול/ה לשלוח משמרות.");
            return;
        }

        try {
            await ensureSavedBeforeSend();

            const fresh = await fetchShiftsByWeek(registrationWeekDataRef.current.weekCode);
            const freshWeek = { weekCode: registrationWeekDataRef.current.weekCode, ...fresh };
            setRegistrationWeekData(freshWeek);
            registrationWeekDataRef.current = freshWeek;

            const myUnsentFullShiftsNow = (freshWeek.shifts || []).filter(
                s => s.employee_id === employeeId && !s.issent && s.start_time && s.end_time
            );

            if (myUnsentFullShiftsNow.length === 0) {
                setErrorMessage("אין משמרות שלא נשלחו.");
                return;
            }

            await markShiftsSent(myUnsentFullShiftsNow.map(s => s.id));

            setRegistrationWeekData(prev => {
                const newShifts = (prev.shifts || []).map(s => {
                    if (s.employee_id !== employeeId) return s;
                    if (s.start_time && s.end_time) return { ...s, issent: true };
                    return s;
                });
                return { ...prev, shifts: newShifts };
            });

            setErrorMessage("");
            alert("נשלח למנהל בהצלחה!");
        } catch (err) {
            setErrorMessage(getFriendlyErrorMessage(err, "נכשל בשליחה למנהל"));
        }
    };

    const renderWeekHeader = (weekCode) => (
        <div className="week-header">
            <span className="week-title">שבוע: {weekCode}</span>
        </div>
    );

    return (
        <div className="employee-dashboard">
            <div className="employee-header">
                <h2>לוח משמרות עובדים</h2>
                <div className="employee-name">שלום {employeeName}</div>
            </div>

            {errorMessage && <div className="error-banner">{errorMessage}</div>}

            <div className="section">
                <div className="section-header">
                    <h3>רישום לשבוע הבא</h3>
                    <div className="nav-buttons">
                        <button onClick={handlePrevWeek} disabled={registrationOffset <= 1}>שבוע קודם</button>
                        <button onClick={handleNextWeek}>שבוע הבא</button>
                    </div>
                </div>

                {renderWeekHeader(registrationWeekData.weekCode)}

                <table className="employee-table">
                    <thead>
                    <tr>
                        <th>יום</th>
                        <th>תאריך</th>
                        <th>שעת התחלה</th>
                        <th>שעת סיום</th>
                        <th>הערה</th>
                        <th>מצב</th>
                    </tr>
                    </thead>
                    <tbody>
                    {days.map((dayName, idx) => {
                        const dateObj = getDateForWeekDay(registrationWeekData.weekCode, idx);
                        const ddmm = formatDDMM(dateObj);

                        const shift = registrationWeekData.shifts.find(
                            s => s.employee_id === employeeId && s.day_name === dayName
                        );

                        const startValue = shift?.start_time || "";
                        const endValue = shift?.end_time || "";
                        const noteValue = shift?.note || "";
                        const statusText = getShiftStatus(shift, registrationWeekData.locked);

                        return (
                            <tr key={dayName}>
                                <td data-label="יום">{dayName}</td>
                                <td data-label="תאריך">{ddmm}</td>

                                <td data-label="שעת התחלה">
                                    {shift?.issent ? (
                                        <input type="text" value={startValue} readOnly className="time-readonly" />
                                    ) : (
                                        <input
                                            type="text"
                                            value={startValue}
                                            placeholder="HH:MM"
                                            onChange={(e) => handleInlineChange(dayName, 'start_time', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, dayName, 'start_time')}
                                            disabled={registrationWeekData.locked}
                                            ref={el => {
                                                if (!dayRefs.current[dayName]) dayRefs.current[dayName] = {};
                                                dayRefs.current[dayName].start = el;
                                            }}
                                        />
                                    )}
                                </td>

                                <td data-label="שעת סיום">
                                    {shift?.issent ? (
                                        <input type="text" value={endValue} readOnly className="time-readonly" />
                                    ) : (
                                        <input
                                            type="text"
                                            value={endValue}
                                            placeholder="HH:MM"
                                            onChange={(e) => handleInlineChange(dayName, 'end_time', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, dayName, 'end_time')}
                                            disabled={registrationWeekData.locked}
                                            ref={el => {
                                                if (!dayRefs.current[dayName]) dayRefs.current[dayName] = {};
                                                dayRefs.current[dayName].end = el;
                                            }}
                                        />
                                    )}
                                </td>

                                <td data-label="הערה">
                                    {shift?.issent ? (
                                        <input type="text" value={noteValue} readOnly className="note-readonly" />
                                    ) : (
                                        <input
                                            type="text"
                                            value={noteValue}
                                            placeholder="הכנס הערה"
                                            onChange={(e) => handleInlineChange(dayName, 'note', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, dayName, 'note')}
                                            disabled={registrationWeekData.locked}
                                            ref={el => {
                                                if (!dayRefs.current[dayName]) dayRefs.current[dayName] = {};
                                                dayRefs.current[dayName].note = el;
                                            }}
                                        />
                                    )}
                                </td>

                                <td data-label="מצב" style={{ textTransform: 'capitalize' }}>{statusText}</td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>

                <div className="actions-row">
                    <button
                        className="send-button"
                        onClick={handleSendToManagerInline}
                        disabled={registrationWeekData.locked}
                    >
                        שלח למנהל
                    </button>
                </div>
            </div>

            <div className="section">
                <div className="section-header">
                    <h3>משמרות שפורסמו</h3>
                    <div className="nav-buttons">
                        <button onClick={handlePrevPublishedWeek}>שבוע קודם</button>
                        <button onClick={handleNextPublishedWeek}>שבוע הבא</button>
                    </div>
                </div>

                {renderWeekHeader(publishedWeekData.weekCode)}

                <table className="employee-table">
                    <thead>
                    <tr>
                        <th>יום</th>
                        <th>תאריך</th>
                        <th>שעת התחלה</th>
                        <th>שעת סיום</th>
                        <th>הערה</th>
                    </tr>
                    </thead>
                    <tbody>
                    {days.map((dayName, idx) => {
                        const dateObj = getDateForWeekDay(publishedWeekData.weekCode, idx);
                        const ddmm = formatDDMM(dateObj);
                        const shift = publishedWeekData.shifts.find(
                            s => s.employee_id === employeeId && s.day_name === dayName
                        );
                        return (
                            <tr key={dayName}>
                                <td>{dayName}</td>
                                <td>{ddmm}</td>
                                <td>{shift?.start_time || '-'}</td>
                                <td>{shift?.end_time || '-'}</td>
                                <td>{shift?.note || '-'}</td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
