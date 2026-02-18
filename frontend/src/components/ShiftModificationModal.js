import React, { useEffect, useMemo, useState } from 'react';
import {
    createShift,
    updateShift,
    createStaticShift,
    updateStaticShift,
    deleteShift
} from '../services/api';
import './ShiftModificationModal.css';

// Helper: compute shift duration (in whole hours)
function computeShiftHours(start, end) {
    const [sH, sM] = String(start).split(':').map(n => parseInt(n, 10));
    const [eH, eM] = String(end).split(':').map(n => parseInt(n, 10));
    let startMin = sH * 60 + sM;
    let endMin = eH * 60 + eM;
    if (endMin <= startMin) endMin += 24 * 60;
    return (endMin - startMin) / 60;
}

function isNumericId(id) {
    return /^\d+$/.test(String(id ?? ''));
}

// weekCode format: "YYYY-Wxx" (e.g., "2026-W07")
function prevWeekCodeYYYYWxx(weekCode) {
    const w = String(weekCode || '').trim();
    const m = w.match(/^(\d{4})-W(\d{2})$/);
    if (!m) return w;

    let year = parseInt(m[1], 10);
    let week = parseInt(m[2], 10);

    week -= 1;
    if (week <= 0) {
        year -= 1;
        week = 53; // sufficient for UI cut-off; backend controls correctness
    }

    const pad2 = (n) => String(n).padStart(2, '0');
    return `${year}-W${pad2(week)}`;
}

export default function ShiftModificationModal({ shift, onClose, onSave }) {
    const [modifiedShift, setModifiedShift] = useState(shift);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        setModifiedShift(shift);
        setErrorMessage('');
    }, [shift]);

    // If static already has end_week_code => it is ended, must not be re-toggled
    const hasEndedStatic = useMemo(() => {
        return !!modifiedShift?.end_week_code;
    }, [modifiedShift]);

    const checkboxChecked = useMemo(() => {
        if (hasEndedStatic) return false;
        return !!modifiedShift?.isStatic;
    }, [hasEndedStatic, modifiedShift]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setModifiedShift((prev) => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e) => {
        const { checked } = e.target;
        if (hasEndedStatic) return;
        setModifiedShift((prev) => ({ ...prev, isStatic: checked }));
    };

    function validateHours(startTime, endTime) {
        const newShiftHours = computeShiftHours(startTime, endTime);
        const total = (modifiedShift.existingDayHours || 0) + newShiftHours;
        if (total > modifiedShift.maxDayHours) {
            setErrorMessage(
                `סה"כ שעות למשמרות ביום ${modifiedShift.dayName} עולות על המגבלה של ${modifiedShift.maxDayHours} שעות.`
            );
            return false;
        }
        return true;
    }

    const handleSave = async () => {
        setErrorMessage('');

        const {
            dayName = 'ראשון',
            employeeId = 1,
            start = '09:00',
            end = '17:00',
            note = ''
        } = modifiedShift;

        if (!validateHours(start, end)) return;

        let normalShiftResponse = null;
        let staticShiftResponse = null;

        try {
            const currentWeekCode = modifiedShift.weekCode ?? shift.weekCode;

            // 1) Save normal shift row (schedule.shifts)
            if (modifiedShift.id && isNumericId(modifiedShift.id)) {
                normalShiftResponse = await updateShift({
                    id: Number(modifiedShift.id),
                    day_name: dayName,
                    start_time: start,
                    end_time: end,
                    note
                });
            } else if (!modifiedShift.id) {
                normalShiftResponse = await createShift({
                    week_code: currentWeekCode,
                    day_name: dayName,
                    employee_id: employeeId,
                    start_time: start,
                    end_time: end,
                    note
                });
            } else {
                // virtual row id like "static-22" - do not call /api/shifts/:id
                normalShiftResponse = { skipped: true };
            }

            // If static already ended - do not allow toggling back / rewriting
            if (hasEndedStatic) {
                if (onSave) onSave(modifiedShift, normalShiftResponse, null);
                onClose();
                return;
            }

            // 2) Static behavior
            if (modifiedShift.isStatic) {
                // create or update static (keep active)
                const staticPayload = {
                    day_name: dayName,
                    employee_id: employeeId,
                    start_time: start,
                    end_time: end,
                    isactive: true,
                    start_week_code: currentWeekCode
                };

                if (modifiedShift.staticId) {
                    staticShiftResponse = await updateStaticShift(modifiedShift.staticId, staticPayload);
                } else {
                    staticShiftResponse = await createStaticShift(staticPayload);
                }

                if (staticShiftResponse?.id) {
                    modifiedShift.staticId = staticShiftResponse.id;
                }
                modifiedShift.start_week_code = currentWeekCode;
                modifiedShift.end_week_code = null;
                modifiedShift.isStatic = true;
            } else {
                // checkbox OFF => stop repeating FROM this week forward
                if (modifiedShift.staticId) {
                    // if already ended (shouldn't happen here), block
                    if (modifiedShift.end_week_code) {
                        setErrorMessage(
                            `קבוע כבר בוטל (עד שבוע ${modifiedShift.end_week_code}). לא ניתן לשנות זאת שוב.`
                        );
                        return;
                    }

                    const endWeek = prevWeekCodeYYYYWxx(currentWeekCode);
                    staticShiftResponse = await updateStaticShift(modifiedShift.staticId, {
                        isactive: true,
                        end_week_code: endWeek
                    });

                    modifiedShift.isStatic = false;
                    modifiedShift.end_week_code = endWeek;
                }
            }

            if (onSave) {
                onSave(modifiedShift, normalShiftResponse, staticShiftResponse);
            }
            onClose();
        } catch (err) {
            setErrorMessage(err?.message || 'שגיאה בשמירת המשמרת.');
        }
    };

    const handleAddAdditionalShift = () => {
        const { start = '09:00', end = '17:00' } = modifiedShift;
        const currentHours = computeShiftHours(start, end);
        const newTotal = (modifiedShift.existingDayHours || 0) + currentHours;

        if (newTotal > modifiedShift.maxDayHours) {
            setErrorMessage(
                `לא ניתן להוסיף משמרת נוספת – הסה"כ יהפוך ל-${newTotal} שעות, העולה על המגבלה של ${modifiedShift.maxDayHours} שעות.`
            );
            return;
        }

        setModifiedShift((prev) => ({
            ...prev,
            id: null,
            start: '09:00',
            end: '17:00',
            note: '',
            existingDayHours: newTotal
        }));
        setErrorMessage('');
    };

    const handleDelete = async () => {
        if (!window.confirm("האם אתה בטוח שברצונך למחוק משמרת זו?")) return;

        setErrorMessage('');

        try {
            const currentWeekCode = modifiedShift.weekCode ?? shift.weekCode;

            // If linked to static and not ended, delete means stop FROM this week forward
            if (modifiedShift.staticId && !modifiedShift.end_week_code) {
                const endWeek = prevWeekCodeYYYYWxx(currentWeekCode);
                await updateStaticShift(modifiedShift.staticId, {
                    isactive: true,
                    end_week_code: endWeek
                });
                modifiedShift.end_week_code = endWeek;
                modifiedShift.isStatic = false;
            }

            // Delete only numeric normal row
            if (modifiedShift.id && isNumericId(modifiedShift.id)) {
                await deleteShift(Number(modifiedShift.id));
            }

            if (onSave) {
                onSave({ ...modifiedShift, deleted: true }, { deleted: true }, null);
            }
            onClose();
        } catch (err) {
            setErrorMessage(err?.message || 'שגיאה במחיקת המשמרת.');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3 className="modal-title">
                        {modifiedShift.id ? 'עריכת משמרת' : 'הוספת משמרת'}{' '}
                        {modifiedShift.employee ? `עבור ${modifiedShift.employee}` : ''}
                    </h3>
                    <button className="close-button" onClick={onClose}>×</button>
                </div>

                {errorMessage && (
                    <div className="modal-error-alert">{errorMessage}</div>
                )}

                <p className="modal-info"><strong>יום:</strong> {modifiedShift.dayName}</p>

                <div className="form-row">
                    <label>שעת התחלה:</label>
                    <input
                        type="time"
                        name="start"
                        value={modifiedShift.start || '09:00'}
                        onChange={handleChange}
                        lang="en-GB"
                        step="60"
                    />
                </div>

                <div className="form-row">
                    <label>שעת סיום:</label>
                    <input
                        type="time"
                        name="end"
                        value={modifiedShift.end || '17:00'}
                        onChange={handleChange}
                        lang="en-GB"
                        step="60"
                    />
                </div>

                <div className="form-row">
                    <label>הערה:</label>
                    <textarea
                        name="note"
                        rows="3"
                        value={modifiedShift.note || ''}
                        onChange={handleChange}
                    />
                </div>

                <div className="form-row checkbox-row">
                    <label>
                        <input
                            type="checkbox"
                            checked={checkboxChecked}
                            disabled={hasEndedStatic}
                            onChange={handleCheckboxChange}
                        />
                        הפוך משמרת זו לקבועה
                    </label>

                    {hasEndedStatic && (
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                            קבוע בוטל (עד שבוע {modifiedShift.end_week_code})
                        </div>
                    )}
                </div>

                <div className="modal-buttons">
                    <button className="save-button" onClick={handleSave}>שמור</button>

                    {modifiedShift.id && (
                        <>
                            <button className="delete-button" onClick={handleDelete}>מחק משמרת</button>
                            <button className="add-additional-button" onClick={handleAddAdditionalShift}>
                                הוסף משמרת נוספת
                            </button>
                        </>
                    )}

                    <button className="cancel-button" onClick={onClose}>ביטול</button>
                </div>
            </div>
        </div>
    );
}
