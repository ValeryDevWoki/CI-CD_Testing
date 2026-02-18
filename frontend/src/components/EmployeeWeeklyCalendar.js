// src/components/EmployeeWeeklyCalendar.js

import React, { useState } from 'react';
import './EmployeeWeeklyCalendar.css';
import EmployeeShiftRegistrationModal from './EmployeeShiftRegistrationModal';

const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function getFixedDateForDay(day) {
    const mapping = {
        Sunday:    '2025-01-05',
        Monday:    '2025-01-06',
        Tuesday:   '2025-01-07',
        Wednesday: '2025-01-08',
        Thursday:  '2025-01-09',
        Friday:    '2025-01-10',
        Saturday:  '2025-01-11'
    };
    return mapping[day];
}

const EmployeeWeeklyCalendar = () => {
    // Keep track of shift registration for each day (object keyed by day)
    // e.g. { Sunday: { date, start, end, note }, Monday: null, ... }
    const initialRegistration = {};
    days.forEach(day => {
        initialRegistration[day] = null; // no shift by default
    });

    const [registrations, setRegistrations] = useState(initialRegistration);

    const [selectedDay, setSelectedDay]       = useState(null);
    const [showModal,   setShowModal]         = useState(false);

    // When user clicks "Register" or "Modify"
    const handleRegisterClick = (day) => {
        setSelectedDay(day);
        setShowModal(true);
    };

    // "Save" from modal => store shift in the registrations for that day
    const handleModalSave = (shift) => {
        // shift is { date, start, end, note }
        setRegistrations(prev => ({
            ...prev,
            [selectedDay]: shift
        }));
        setShowModal(false);
        setSelectedDay(null);
    };

    // "Cancel" => close modal
    const handleModalClose = () => {
        setShowModal(false);
        setSelectedDay(null);
    };

    // "Remove" => clear the shift from that day
    const handleRemoveShift = (day) => {
        setRegistrations(prev => ({
            ...prev,
            [day]: null
        }));
    };

    return (
        <div className="employee-weekly-calendar">
            <h3>Weekly Schedule</h3>
            <table>
                <thead>
                <tr>
                    <th>Day</th>
                    <th>Date</th>
                    <th>Your Shift</th>
                    <th>Action</th>
                </tr>
                </thead>
                <tbody>
                {days.map(day => {
                    const date = getFixedDateForDay(day);
                    const reg  = registrations[day]; // e.g. { date, start, end, note } or null
                    return (
                        <tr key={day}>
                            <td>{day}</td>
                            <td>{date}</td>
                            <td>
                                {reg
                                    ? `${reg.start} - ${reg.end}${reg.note ? ` (Note: ${reg.note})` : ''}`
                                    : '-'
                                }
                            </td>
                            <td>
                                <button onClick={() => handleRegisterClick(day)}>
                                    {reg ? 'Modify' : 'Register'}
                                </button>
                                {/* If there's a shift, show Remove */}
                                {reg && (
                                    <button onClick={() => handleRemoveShift(day)}>
                                        Remove
                                    </button>
                                )}
                            </td>
                        </tr>
                    );
                })}
                </tbody>
            </table>

            {showModal && selectedDay && (
                <EmployeeShiftRegistrationModal
                    date={getFixedDateForDay(selectedDay)}
                    initialShift={registrations[selectedDay]}
                    onSave={handleModalSave}
                    onClose={handleModalClose}
                />
            )}
        </div>
    );
};

export default EmployeeWeeklyCalendar;
