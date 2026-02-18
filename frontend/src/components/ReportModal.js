import React, { useState, useEffect } from 'react';
import { fetchEmployees, fetchShifts, fetchSkills } from '../services/api';
import { getCurrentWeekCode, getDateForWeekDay } from '../utils/dateUtils';
import './ReportModal.css';

// Utility: Convert an array of objects to CSV text.
function jsonToCSV(items) {
    if (!items || !items.length) return '';
    const header = Object.keys(items[0]).join(',');
    const rows = items.map(item =>
        Object.values(item)
            .map(val => `"${val}"`)
            .join(',')
    );
    return header + '\n' + rows.join('\n');
}

// Utility: Trigger CSV download and prepend a UTF-8 BOM for Excel compatibility.
function downloadCSV(csv, filename) {
    // Prepend BOM:
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csv;

    // Build blob and trigger a download
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Helper: Normalize a date to midnight.
function normalizeDate(d) {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
}

// Helper: Compute duration in whole hours given start/end "HH:MM"
function computeDuration(startTime, endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let startMinutes = sh * 60 + sm;
    let endMinutes = eh * 60 + em;
    if (endMinutes < startMinutes) {
        // handle shifts past midnight
        endMinutes += 24 * 60;
    }
    return Math.round((endMinutes - startMinutes) / 60);
}

export default function ReportModal({ onClose }) {
    const [reportType, setReportType] = useState('shifts');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [partialDay, setPartialDay] = useState(false);
    const [fromTime, setFromTime] = useState('09:00');
    const [toTime, setToTime] = useState('17:00');
    const [selectedEmployee, setSelectedEmployee] = useState(''); // For filtering in not-working report
    const [employees, setEmployees] = useState([]);
    const [skills, setSkills] = useState([]);

    // הגבלת תאריכים: שנתיים אחורה ושנתיים קדימה.
    const today = new Date();
    const minDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate())
        .toISOString().split('T')[0];
    const maxDate = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate())
        .toISOString().split('T')[0];

    useEffect(() => {
        fetchEmployees()
            .then(data => setEmployees(data))
            .catch(err => console.error('נכשל בטעינת העובדים', err));

        fetchSkills()
            .then(data => setSkills(data))
            .catch(err => console.error('נכשל בטעינת הכישורים', err));
    }, []);

    async function handleDownloadReport() {
        let csvData = '';
        try {
            if (reportType === 'shifts') {
                if (!startDate) {
                    alert('אנא בחר תאריך התחלה');
                    return;
                }
                const date = new Date(startDate);
                const weekCode = getCurrentWeekCode(date);
                const rawShifts = await fetchShifts(weekCode);
                // Unwrap the shifts array if needed.
                let weekShifts = Array.isArray(rawShifts) ? rawShifts : rawShifts.shifts;
                // רק משמרות שפורסמו
                weekShifts = weekShifts.filter(shift => shift.ispublished === true);

                // סינון לפי חלון שעות (חלקי) אם צריך
                let filteredShifts = weekShifts;
                if (partialDay) {
                    filteredShifts = weekShifts.filter(
                        shift => shift.end_time > fromTime && shift.start_time < toTime
                    );
                }

                const weekDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

                // Build report data with multiple shifts per day
                const reportData = employees.map(emp => {
                    let totalHours = 0;
                    const row = { "שם עובד": emp.name };

                    weekDays.forEach(day => {
                        // Get all shifts for that day.
                        const dayShifts = filteredShifts.filter(
                            s => s.employee_id === emp.id && s.day_name === day
                        );
                        if (dayShifts.length > 0) {
                            // Join all shifts in the same cell
                            const shiftStrings = dayShifts.map(shift => {
                                const hrs = computeDuration(shift.start_time, shift.end_time);
                                totalHours += hrs;
                                return `${shift.start_time} - ${shift.end_time} (${hrs})`;
                            });
                            row[day] = shiftStrings.join(' | ');
                        } else {
                            row[day] = '-';
                        }
                    });

                    row["סה\"כ שעות"] = totalHours;
                    return row;
                })
                    .filter(row => partialDay ? row["סה\"כ שעות"] > 0 : true);

                csvData = jsonToCSV(reportData);

            } else if (reportType === 'registered_not_published') {
                if (!startDate) {
                    alert('אנא בחר תאריך התחלה');
                    return;
                }
                const date = new Date(startDate);
                const weekCode = getCurrentWeekCode(date);
                const rawShifts = await fetchShifts(weekCode);
                let weekShifts = Array.isArray(rawShifts) ? rawShifts : rawShifts.shifts;
                // כל המשמרות הרשומות (issent === true)
                weekShifts = weekShifts.filter(shift => shift.issent === true);

                // סינון לפי חלון שעות (חלקי) אם צריך
                let filteredShifts = weekShifts;
                if (partialDay) {
                    filteredShifts = weekShifts.filter(
                        shift => shift.end_time > fromTime && shift.start_time < toTime
                    );
                }

                const weekDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

                // Build report data with multiple shifts per day
                const reportData = employees.map(emp => {
                    let totalHours = 0;
                    const row = { "שם עובד": emp.name };

                    weekDays.forEach(day => {
                        const dayShifts = filteredShifts.filter(
                            s => s.employee_id === emp.id && s.day_name === day
                        );
                        if (dayShifts.length > 0) {
                            const shiftStrings = dayShifts.map(shift => {
                                const hrs = computeDuration(shift.start_time, shift.end_time);
                                totalHours += hrs;
                                return `${shift.start_time} - ${shift.end_time} (${hrs})`;
                            });
                            row[day] = shiftStrings.join(' | ');
                        } else {
                            row[day] = '-';
                        }
                    });

                    row["סה\"כ שעות"] = totalHours;
                    return row;
                })
                    .filter(row => partialDay ? row["סה\"כ שעות"] > 0 : true);

                csvData = jsonToCSV(reportData);

            } else if (reportType === 'not_working') {
                if (!startDate || !endDate) {
                    alert('אנא בחר תאריך התחלה וסיום');
                    return;
                }
                const start = normalizeDate(new Date(startDate));
                const end = normalizeDate(new Date(endDate));
                const weekDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
                const weekCodesSet = new Set();

                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    weekCodesSet.add(getCurrentWeekCode(new Date(d)));
                }
                const weekCodes = Array.from(weekCodesSet);

                let allShifts = [];
                for (const wCode of weekCodes) {
                    const raw = await fetchShifts(wCode);
                    const wShifts = Array.isArray(raw) ? raw : raw.shifts;
                    wShifts.forEach(shift => {
                        const dayIndex = weekDays.indexOf(shift.day_name);
                        if (dayIndex === -1) return;
                        const shiftDate = normalizeDate(getDateForWeekDay(wCode, dayIndex));
                        if (shiftDate >= start && shiftDate <= end) {
                            allShifts.push(shift);
                        }
                    });
                }

                const employeesWorked = {};
                weekDays.forEach(day => { employeesWorked[day] = new Set(); });
                allShifts.forEach(shift => {
                    employeesWorked[shift.day_name].add(shift.employee_id);
                });

                // Build a table of employees who did NOT work each day
                let reportData = [];
                const missingByDay = {};
                weekDays.forEach(day => {
                    missingByDay[day] = employees
                        .filter(emp => !employeesWorked[day].has(emp.id))
                        .map(emp => emp.name);
                });

                let maxRows = 0;
                weekDays.forEach(day => {
                    maxRows = Math.max(maxRows, missingByDay[day].length);
                });
                for (let i = 0; i < maxRows; i++) {
                    const row = {};
                    weekDays.forEach(day => {
                        row[day] = missingByDay[day][i] || '';
                    });
                    reportData.push(row);
                }
                csvData = jsonToCSV(reportData);
            }

            if (!csvData) {
                alert('אין נתונים עבור הפרמטרים שנבחרו.');
                return;
            }
            // Download with BOM so Excel shows Hebrew properly.
            downloadCSV(csvData, `${reportType}_report_${startDate}.csv`);
        } catch (err) {
            console.error(err);
            alert('שגיאה ביצירת הדוח: ' + err.message);
        }
    }

    return (
        <div className="report-modal-overlay">
            <div className="report-modal">
                <button className="modal-close-btn" onClick={onClose}>X</button>
                <h2>הורד דוחות CSV</h2>
                <div className="report-options">
                    <div className="option-group">
                        <label>
                            סוג דוח:
                            <select
                                value={reportType}
                                onChange={(e) => setReportType(e.target.value)}
                            >
                                <option value="shifts">דוח משמרות</option>
                                <option value="not_working">דוח עובדים שאינם עובדים</option>
                                <option value="registered_not_published">דוח רשום (הכל רשום)</option>
                            </select>
                        </label>
                    </div>

                    <div className="option-group">
                        <label>
                            תאריך התחלה:
                            <input
                                type="date"
                                value={startDate}
                                min={minDate}
                                max={maxDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </label>
                        <label>
                            תאריך סיום:
                            <input
                                type="date"
                                value={endDate}
                                min={minDate}
                                max={maxDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </label>
                    </div>

                    {reportType === 'not_working' && (
                        <div className="option-group">
                            <label>
                                בחר עובד (אופציונלי):
                                <select
                                    value={selectedEmployee}
                                    onChange={(e) => setSelectedEmployee(e.target.value)}
                                >
                                    <option value="">--כל העובדים--</option>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>
                                            {emp.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    )}

                    {reportType === 'shifts' && (
                        <div className="option-group">
                            <div>
                                <label>
                                    <input
                                        type="radio"
                                        name="dayOption"
                                        checked={!partialDay}
                                        onChange={() => setPartialDay(false)}
                                    />
                                    יום מלא
                                </label>
                                <label>
                                    <input
                                        type="radio"
                                        name="dayOption"
                                        checked={partialDay}
                                        onChange={() => setPartialDay(true)}
                                    />
                                    יום חלקי
                                </label>
                            </div>
                            {partialDay && (
                                <div>
                                    <label>
                                        מ-שעה:
                                        <input
                                            type="time"
                                            value={fromTime}
                                            onChange={(e) => setFromTime(e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        עד שעה:
                                        <input
                                            type="time"
                                            value={toTime}
                                            onChange={(e) => setToTime(e.target.value)}
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <button className="download-btn" onClick={handleDownloadReport}>
                    הורד CSV
                </button>
            </div>
        </div>
    );
}
