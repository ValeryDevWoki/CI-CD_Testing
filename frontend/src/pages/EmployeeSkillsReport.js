import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { fetchAllUsers, fetchShifts, fetchSkills } from '../services/api';
import { getCurrentWeekCode } from '../utils/dateUtils';
import './EmployeeSkillsReport.css'; // ensure proper styles exist

// Fixed Hebrew day names (Sunday is ראשון, etc.)
const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// Helper: Compute the total whole hours for a shift (based on "HH:MM" strings)
const getShiftDuration = (shift) => {
    if (!shift.start_time || !shift.end_time) return "";
    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    let duration = endHour - startHour + (endMinute - startMinute) / 60;
    if (duration < 0) {
        // Handle shifts that pass midnight
        duration += 24;
    }
    return Math.round(duration);
};

export default function EmployeeSkillsReport() {
    const navigate = useNavigate();

    // Default selected date is today.
    const todayStr = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(todayStr);
    // Compute weekCode using your dateUtils based on the selected date.
    const [weekCode, setWeekCode] = useState(getCurrentWeekCode(new Date(todayStr)));

    const [employees, setEmployees] = useState([]);
    const [skills, setSkills] = useState([]);
    const [shifts, setShifts] = useState([]);

    // Download popup (modal) states:
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [downloadOption, setDownloadOption] = useState('all'); // "all" | "filter"
    const [selectedSkillsForDownload, setSelectedSkillsForDownload] = useState([]);

    // Update weekCode when the selected date changes
    useEffect(() => {
        const newWeekCode = getCurrentWeekCode(new Date(selectedDate));
        setWeekCode(newWeekCode);
    }, [selectedDate]);

    // When weekCode changes, fetch shifts
    useEffect(() => {
        async function loadShifts() {
            try {
                const shiftsData = await fetchShifts(weekCode);
                // Some APIs return { shifts: [...] }, others return an array
                const allShifts = Array.isArray(shiftsData) ? shiftsData : shiftsData.shifts;
                setShifts(allShifts);
            } catch (err) {
                alert(err.message || "נכשל בטעינת המשמרות");
            }
        }
        loadShifts();
    }, [weekCode]);

    // Load user data and skills on mount
    useEffect(() => {
        async function loadData() {
            try {
                const usersData = await fetchAllUsers();
                // Filter for active employees
                const employeeUsers = usersData.filter(
                    (u) =>
                        u.role &&
                        u.role.toLowerCase() === 'employee' &&
                        u.status &&
                        u.status.toLowerCase() === 'active'
                );
                setEmployees(employeeUsers);

                const skillsData = await fetchSkills();
                if (Array.isArray(skillsData)) {
                    setSkills(skillsData);
                } else if (skillsData.skills) {
                    // some APIs return { skills: [...] }
                    setSkills(skillsData.skills);
                }
            } catch (err) {
                alert(err.message || "נכשל בטעינת הנתונים");
            }
        }
        loadData();
    }, []);

    // Determine the day name (Hebrew) from selectedDate
    const dayIndex = new Date(selectedDate).getDay(); // 0 = Sunday, etc.
    const dayName = days[dayIndex];

    // Filter shifts for the selected day
    const shiftsForDay = shifts.filter(
        (shift) => shift.day_name && shift.day_name.trim() === dayName
    );

    // Build mapping: employee_id -> array of shifts for that day
    const shiftsByEmployee = {};
    shiftsForDay.forEach((shift) => {
        if (shiftsByEmployee[shift.employee_id]) {
            shiftsByEmployee[shift.employee_id].push(shift);
        } else {
            shiftsByEmployee[shift.employee_id] = [shift];
        }
    });

    // Helper: Check if an employee has a given skill
    const employeeHasSkill = (emp, skill) => {
        if (!emp.skills || !Array.isArray(emp.skills)) return false;
        return emp.skills.some((s) => {
            // If stored as numeric IDs:
            if (typeof s === 'number') {
                return s === skill.id;
            }
            // If stored as strings:
            if (typeof s === 'string') {
                return (
                    s.trim().toLowerCase() ===
                    (skill.name || skill.skill_name || '').trim().toLowerCase()
                );
            }
            // If stored as an object:
            if (typeof s === 'object' && s !== null) {
                const normalizedEmpSkill = (s.name || s.skill_name || '')
                    .trim()
                    .toLowerCase();
                const normalizedSkill = (skill.name || skill.skill_name || '')
                    .trim()
                    .toLowerCase();
                return s.id == skill.id || normalizedEmpSkill === normalizedSkill;
            }
            return false;
        });
    };

    // Open the modal to select download options
    const handleOpenDownloadModal = () => {
        // Reset any previous states
        setDownloadOption('all');
        setSelectedSkillsForDownload([]);
        setShowDownloadModal(true);
    };

    const handleToggleSkillSelection = (skillId) => {
        setSelectedSkillsForDownload((prev) => {
            if (prev.includes(skillId)) {
                // Remove skill
                return prev.filter((id) => id !== skillId);
            } else {
                // Add skill
                return [...prev, skillId];
            }
        });
    };

    // Build & download the CSV with BOM so Excel displays Hebrew properly
    const downloadCsv = (csvContent) => {
        // Prepend BOM for correct UTF-8 in Excel
        const bom = '\uFEFF';
        const csvWithBom = bom + csvContent;
        const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
        const fileName = `EmployeeSkillsReport_${selectedDate}.csv`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Confirm the CSV download based on the selected option
    const handleConfirmDownload = () => {
        if (downloadOption === 'all') {
            // OPTION 1: Entire day, all employees, all skills
            let csvContent = '';
            const header = [
                'עובד',
                `משמרת (${dayName})`,
                ...skills.map((skill) => skill.name || skill.skill_name || `Skill ${skill.id}`)
            ];
            csvContent += header.join(',') + '\n';

            employees.forEach((emp) => {
                const row = [];
                const displayName = emp.full_name || emp.name || 'לא זמין';
                row.push(`"${displayName}"`);

                const empShifts = shiftsByEmployee[emp.id] || [];
                const shiftText =
                    empShifts.length > 0
                        ? empShifts
                            .map(
                                (shift) =>
                                    `${shift.start_time} - ${shift.end_time} (${getShiftDuration(
                                        shift
                                    )})`
                            )
                            .join(' | ')
                        : '-';
                row.push(`"${shiftText}"`);

                skills.forEach((skill) => {
                    const hasSkill = employeeHasSkill(emp, skill);
                    row.push(hasSkill ? `"✔"` : `""`);
                });

                csvContent += row.join(',') + '\n';
            });

            downloadCsv(csvContent);
        } else {
            // OPTION 2: Filter by specific skills
            const chosenSkills = skills.filter((s) =>
                selectedSkillsForDownload.includes(s.id)
            );
            if (chosenSkills.length === 0) {
                alert('לא נבחרו כישורים להורדה');
                return;
            }

            // Only employees with at least one chosen skill
            const filteredEmployees = employees.filter((emp) =>
                chosenSkills.some((skill) => employeeHasSkill(emp, skill))
            );

            let csvContent = '';
            const header = [
                'עובד',
                `משמרת (${dayName})`,
                ...chosenSkills.map((skill) => skill.name || skill.skill_name || `Skill ${skill.id}`)
            ];
            csvContent += header.join(',') + '\n';

            filteredEmployees.forEach((emp) => {
                const row = [];
                const displayName = emp.full_name || emp.name || 'לא זמין';
                row.push(`"${displayName}"`);

                const empShifts = shiftsByEmployee[emp.id] || [];
                const shiftText =
                    empShifts.length > 0
                        ? empShifts
                            .map(
                                (shift) =>
                                    `${shift.start_time} - ${shift.end_time} (${getShiftDuration(
                                        shift
                                    )})`
                            )
                            .join(' | ')
                        : '-';
                row.push(`"${shiftText}"`);

                chosenSkills.forEach((skill) => {
                    const hasSkill = employeeHasSkill(emp, skill);
                    row.push(hasSkill ? `"✔"` : `""`);
                });

                csvContent += row.join(',') + '\n';
            });

            downloadCsv(csvContent);
        }

        // Close modal after downloading
        setShowDownloadModal(false);
    };

    return (
        <div className="employee-skills-report-page">
            <NavBar />
            <div className="report-header">
                <h2>דוח כישורים</h2>
                <div className="report-controls">
                    <label>
                        בחר תאריך:{' '}
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </label>
                    <button onClick={handleOpenDownloadModal}>הורד דוח</button>
                    <button onClick={() => navigate('/employee-schedule-list')}>חזור</button>
                </div>
            </div>

            <div className="table-wrapper">
                <table className="report-table">
                    <thead>
                    <tr>
                        <th>עובד</th>
                        <th>משמרת ({dayName})</th>
                        {skills.map((skill) => (
                            <th key={skill.id}>
                                {skill.name || skill.skill_name || `Skill ${skill.id}`}
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {employees.map((emp) => {
                        const empShifts = shiftsByEmployee[emp.id] || [];
                        return (
                            <tr key={emp.id}>
                                <td>{emp.full_name || emp.name || 'לא זמין'}</td>
                                <td>
                                    {empShifts.length === 0 ? (
                                        '-'
                                    ) : (
                                        <div className="shifts-container">
                                            {empShifts.map((shift) => {
                                                const hours = getShiftDuration(shift);
                                                return (
                                                    <div key={shift.id} className="shift-item">
                                                        {shift.start_time} - {shift.end_time} (
                                                        {hours})
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </td>
                                {skills.map((skill) => (
                                    <td key={skill.id}>
                                        {employeeHasSkill(emp, skill) ? '✔️' : ''}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>

            {/* --- Modal for download options --- */}
            {showDownloadModal && (
                <div className="download-modal-overlay">
                    <div className="download-modal">
                        <h3>בחר אפשרות הורדה</h3>
                        <div className="option-group">
                            <label>
                                <input
                                    type="radio"
                                    value="all"
                                    checked={downloadOption === 'all'}
                                    onChange={() => setDownloadOption('all')}
                                />
                                הורד את היום כולו (כל העובדים, כל הכישורים)
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    value="filter"
                                    checked={downloadOption === 'filter'}
                                    onChange={() => setDownloadOption('filter')}
                                />
                                בחר כישורים ספציפיים
                            </label>
                        </div>

                        {downloadOption === 'filter' && (
                            <div className="skills-selection">
                                <p>בחר כישורים להורדה:</p>
                                <div className="skills-checkbox-list">
                                    {skills.map((skill) => {
                                        const skillLabel =
                                            skill.name ||
                                            skill.skill_name ||
                                            `Skill ${skill.id}`;
                                        return (
                                            <label key={skill.id}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSkillsForDownload.includes(skill.id)}
                                                    onChange={() => handleToggleSkillSelection(skill.id)}
                                                />
                                                {skillLabel}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="modal-buttons">
                            <button className="action-button" onClick={handleConfirmDownload}>
                                הורד
                            </button>
                            <button
                                className="action-button"
                                onClick={() => setShowDownloadModal(false)}
                            >
                                ביטול
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
