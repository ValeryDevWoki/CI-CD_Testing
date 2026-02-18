import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
    fetchWanted,
    updateWanted,
    fetchWantedTotal,
    updateWantedTotal,
    fetchWeekLockStatus,
    updateWeekLock,
    sendRegistrationReminder
} from '../services/api';
import { getDateForWeekDay, formatDDMM } from '../utils/dateUtils';
import './EditableWeeklyScheduleTable.css';

// Days in Hebrew
const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function parseHour(str) {
    return parseInt(str.split(':')[0], 10);
}

// minute-accurate
function toMinutes(str) {
    const [hStr, mStr = '0'] = str.split(':');
    const h = Number(hStr), m = Number(mStr);
    if (h === 24 && m === 0) return 24 * 60;
    return h * 60 + m;
}

/**
 * Split cross-midnight shifts into two entries.
 */
function splitCrossMidnight(rawShifts) {
    const result = [];
    for (const sh of rawShifts) {
        const sMin = toMinutes(sh.start_time);
        const eMin = toMinutes(sh.end_time);
        if (eMin <= sMin) {
            result.push({ ...sh, end_time: '24:00' });
            const dayIndex = days.indexOf(sh.day_name);
            const nextDayName = days[(dayIndex + 1) % 7];
            result.push({ ...sh, day_name: nextDayName, start_time: '00:00', end_time: sh.end_time });
        } else {
            result.push(sh);
        }
    }
    return result;
}

/**
 * Count employees covering this hour with ≥30 minutes overlap (end-exclusive).
 */
function getAssignedCountForHour(shiftsForDay, hour) {
    const THRESHOLD = 30;
    const winStart = hour * 60;
    const winEnd = (hour + 1) * 60;
    let count = 0;
    for (const shift of shiftsForDay) {
        const s = toMinutes(shift.start_time);
        const e = toMinutes(shift.end_time);
        const overlap = Math.max(0, Math.min(e, winEnd) - Math.max(s, winStart));
        if (overlap >= THRESHOLD) count++;
    }
    return count;
}

function normalizeDay(str) {
    return (str || '').replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
}

export default function EditableWeeklyScheduleTable({ weekKey, forcedShifts }) {
    const hourCount = 24;
    const navigate = useNavigate();

    const [wantedRows, setWantedRows] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [wantedMatrix, setWantedMatrix] = useState(
        Array.from({ length: hourCount }, () => Array(7).fill(5))
    );
    const [wantedTotals, setWantedTotals] = useState({});
    const [isLocked, setIsLocked] = useState(false);
    const [lockDate, setLockDate] = useState('');

    // Load data for the given week
    useEffect(() => {
        async function loadAll() {
            try {
                // 1) Lock status
                const lockInfo = await fetchWeekLockStatus(weekKey);
                setIsLocked(lockInfo.locked);
                if (lockInfo.lock_date) {
                    const d = new Date(lockInfo.lock_date);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const hour = String(d.getHours()).padStart(2, '0');
                    const min = String(d.getMinutes()).padStart(2, '0');
                    setLockDate(`${year}-${month}-${day}T${hour}:${min}`);
                } else {
                    setLockDate('');
                }

                // 2) Wanted (hourly)
                const wData = await fetchWanted(weekKey);
                setWantedRows(wData);

                // 3) Wanted totals (daily)
                const dailyTotals = await fetchWantedTotal(weekKey);
                const totalsObj = {};
                for (const row of dailyTotals) {
                    totalsObj[row.day_name] = row.wanted_count;
                }
                setWantedTotals(totalsObj);

                // 4) Shifts:
                //    Manager wants ALL shifts provided by backend — ignore issent/ispublished and NO dedupe.
                if (forcedShifts === null) {
                    // parent still loading; keep empty until it arrives to avoid mixing sources
                    setShifts([]);
                } else {
                    const normalized = (forcedShifts || []).map(s => ({
                        ...s,
                        day_name: normalizeDay(s.day_name),
                    }));
                    const splitted = splitCrossMidnight(normalized);
                    setShifts(splitted);
                }
            } catch (err) {
                console.error('שגיאה בטעינת הנתונים:', err);
                alert(err.message || `נכשל בטעינת הנתונים עבור ${weekKey}`);
            }
        }
        loadAll();
    }, [weekKey, forcedShifts]);

    // Build wanted matrix
    useEffect(() => {
        const newMat = Array.from({ length: hourCount }, () => Array(7).fill(5));
        for (const row of wantedRows) {
            const dIdx = days.indexOf(row.day_name);
            if (dIdx >= 0 && row.hour >= 0 && row.hour < 24) {
                newMat[row.hour][dIdx] = row.wanted_count;
            }
        }
        setWantedMatrix(newMat);
    }, [wantedRows]);

    async function handleToggleLock() {
        const newLocked = !isLocked;
        setIsLocked(newLocked);
        try {
            await updateWeekLock(weekKey, { locked: newLocked, lock_date: lockDate || null });
        } catch (err) {
            console.error('שגיאה בהחלפת מצב הנעילה:', err);
            alert(err.message || 'נכשל בעדכון מצב הנעילה');
            setIsLocked(!newLocked);
        }
    }

    async function handleLockDateChange(e) {
        const newDateValue = e.target.value;
        setLockDate(newDateValue);
        try {
            await updateWeekLock(weekKey, { locked: isLocked, lock_date: newDateValue || null });
        } catch (err) {
            console.error('שגיאה בעדכון תאריך/שעת הנעילה:', err);
            alert(err.message || 'נכשל בעדכון תאריך/שעת הנעילה');
        }
    }

    async function handleSendRegistration() {
        try {
            await sendRegistrationReminder(weekKey);
            alert('הודעת תבנית #1 נשלחה לכל העובדים הפעילים!');
        } catch (err) {
            console.error('שגיאה בשליחת תזכורת הרישום:', err);
            alert(err.message || 'נכשל בשליחת תזכורת הרישום.');
        }
    }

    function handleWantedChange(hourIdx, dayIdx, newVal) {
        const matCopy = [...wantedMatrix];
        matCopy[hourIdx] = [...matCopy[hourIdx]];
        matCopy[hourIdx][dayIdx] = newVal;
        setWantedMatrix(matCopy);
        const dayName = days[dayIdx];
        updateWanted({
            weekCode: weekKey,
            dayName,
            hour: hourIdx,
            wantedCount: newVal
        }).catch(err => {
            console.error('שגיאה בעדכון הכיסוי המבוקש:', err);
            alert(err.message || 'נכשל בעדכון הכיסוי המבוקש.');
        });
    }

    function handleWantedTotalChange(dayName, newVal) {
        setWantedTotals(prev => ({ ...prev, [dayName]: newVal }));
        updateWantedTotal({
            weekCode: weekKey,
            dayName,
            wantedCount: newVal
        }).catch(err => {
            console.error('שגיאה בעדכון הכיסוי היומי:', err);
            alert(err.message || 'נכשל בעדכון הכיסוי היומי.');
        });
    }

    function getAssignedClass(wanted, assigned) {
        if (assigned < wanted) return 'under-assigned';
        if (assigned === wanted) return 'exact-assigned';
        return 'over-assigned';
    }

    const hourLabels = Array.from({ length: hourCount }, (_, i) => i + ':00');

    // Export Assigned to Excel
    function handleDownloadExcel() {
        const header = ['שעה', ...days.map((dayName, dIdx) => {
            const dateObj = getDateForWeekDay(weekKey, dIdx);
            const ddmm = formatDDMM(dateObj);
            return `${dayName} (${ddmm})`;
        })];

        const data = [header];

        for (let h = 0; h < hourCount; h++) {
            const row = [hourLabels[h]];
            for (let d = 0; d < days.length; d++) {
                const dayName = days[d];
                const shiftsForDay = shifts.filter(s => s.day_name === dayName);
                const assigned = getAssignedCountForHour(shiftsForDay, h);
                row.push(assigned);
            }
            data.push(row);
        }

        const totalsRow = ['סה״כ'];
        for (let d = 0; d < days.length; d++) {
            const colIndex = d + 1;
            const colLetter = XLSX.utils.encode_cell({ c: colIndex, r: 0 }).replace(/\d+/g, '');
            const startRowExcel = 2;
            const endRowExcel = 25;
            totalsRow.push({ f: `SUM(${colLetter}${startRowExcel}:${colLetter}${endRowExcel})` });
        }
        data.push(totalsRow);

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 8 }, ...days.map(() => ({ wch: 12 }))];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `מוקצה_${weekKey}`);
        XLSX.writeFile(wb, `מוקצה_${weekKey}.xlsx`);
    }

    return (
        <div className="editable-weekly-schedule-table">
            <div className="header-row">
                <h2 className="schedule-title">לוח משמרות - {weekKey}</h2>
                <div className="lock-controls">
                    <button onClick={handleToggleLock} className="lock-button">
                        {isLocked ? 'נעול' : 'לא נעול'}
                    </button>

                    <div className="lock-date">
                        <label>תאריך/שעת נעילה:</label>
                        <input
                            type="datetime-local"
                            value={lockDate}
                            onChange={handleLockDateChange}
                        />
                    </div>
                    <button onClick={handleSendRegistration} className="send-button">
                        שלח לעובדים
                    </button>
                    <button onClick={handleDownloadExcel} className="download-button">
                        אקסל מוקצה
                    </button>
                </div>
            </div>

            <table>
                <thead>
                <tr>
                    <th rowSpan="2">שעה</th>
                    {days.map((dayName, dIdx) => {
                        const dateObj = getDateForWeekDay(weekKey, dIdx);
                        const ddmm = formatDDMM(dateObj);
                        return (
                            <th key={dayName} colSpan="2">
                                {dayName} ({ddmm})
                            </th>
                        );
                    })}
                </tr>
                <tr>
                    {days.map((_, idx) => (
                        <React.Fragment key={idx}>
                            <th>מבוקש</th>
                            <th>מוקצה</th>
                        </React.Fragment>
                    ))}
                </tr>
                </thead>
                <tbody>
                {hourLabels.map((label, rowIdx) => (
                    <tr key={rowIdx}>
                        <td>{label}</td>
                        {days.map((dayName, colIdx) => {
                            const wanted = wantedMatrix[rowIdx][colIdx];
                            const shiftsForDay = shifts.filter(s => s.day_name === dayName);
                            const assigned = getAssignedCountForHour(shiftsForDay, rowIdx);
                            return (
                                <React.Fragment key={colIdx}>
                                    <td>
                                        <input
                                            type="number"
                                            className="table-input"
                                            value={wanted}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10) || 0;
                                                handleWantedChange(rowIdx, colIdx, val);
                                            }}
                                        />
                                    </td>
                                    <td>
                      <span
                          className={`clickable-cell ${getAssignedClass(wanted, assigned)}`}
                          onClick={() => navigate(`/schedule-detail/${weekKey}/${colIdx}/${rowIdx}`)}
                      >
                        {assigned}
                      </span>
                                    </td>
                                </React.Fragment>
                            );
                        })}
                    </tr>
                ))}
                <tr className="daily-wanted-row">
                    <td>מבוקש (יומי)</td>
                    {days.map(dayName => {
                        const val = wantedTotals[dayName] || 0;
                        return (
                            <td key={dayName} colSpan="2">
                                <input
                                    type="number"
                                    className="table-input"
                                    value={val}
                                    onChange={(e) => {
                                        const newVal = parseInt(e.target.value, 10) || 0;
                                        handleWantedTotalChange(dayName, newVal);
                                    }}
                                />
                            </td>
                        );
                    })}
                </tr>
                <tr className="total-row">
                    <td>סה״כ עובדים</td>
                    {days.map(dayName => {
                        const dayShifts = shifts.filter(s => s.day_name === dayName);
                        const uniqueEmp = new Set(dayShifts.map(s => s.employee_id));
                        return (
                            <td key={dayName} colSpan="2">
                                {uniqueEmp.size}
                            </td>
                        );
                    })}
                </tr>
                <tr className="hourly-sum-row">
                    <td>סה״כ שעות (מבוקש / נרשם)</td>
                    {days.map((dayName, dayIdx) => {
                        const totalWanted = wantedMatrix.reduce(
                            (sum, row) => sum + row[dayIdx],
                            0
                        );
                        const shiftsForDay = shifts.filter(s => s.day_name === dayName);
                        const totalRegistered = Array.from({ length: hourCount }, (_, hourIdx) =>
                            getAssignedCountForHour(shiftsForDay, hourIdx)
                        ).reduce((sum, num) => sum + num, 0);
                        return (
                            <td key={dayName} colSpan="2">
                                {totalWanted} / {totalRegistered}
                            </td>
                        );
                    })}
                </tr>
                </tbody>
            </table>
        </div>
    );
}
